import { fileURLToPath } from 'node:url';

import { afterEach, expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';

import { createRegistryInstallation } from '../__tests__/installation.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { registryMigrator } from './migrate.ts';
import {
  readRegistrySchemaIdentity,
  stampRegistryFingerprint,
  verifyRegistryDatabases,
} from './schema-state.ts';
const migrations = await readMigrations(
  fileURLToPath(new URL('../../migrations', import.meta.url)),
  'Template Registry',
);
type Database = Awaited<ReturnType<typeof createRegistryInstallation>>;
const databases: Database[] = [];
const setup = async () => {
  const database = await createRegistryInstallation();
  databases.push(database);
  await registryMigrator.migrate(
    database.owner,
    migrations,
    REGISTRY_SCHEMA_FINGERPRINT,
    database.allowedLogins,
  );
  return database;
};
afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.dispose()));
});

it('verifies both restricted roles in the same live database without leaving locks or transactions', async () => {
  const database = await setup();
  const identity = await readRegistrySchemaIdentity(database.pool);
  expect(identity).toMatch(/^[0-9a-f-]{36}$/);
  expect(
    await verifyRegistryDatabases(database.pool, database.operatorPool),
  ).toBe(identity);
  for (const pool of [database.pool, database.operatorPool]) {
    expect(
      (
        await pool.query<{ can_use: boolean }>(
          "SELECT has_schema_privilege(current_user, 'registry_migrations', 'USAGE') AS can_use",
        )
      ).rows,
    ).toEqual([{ can_use: false }]);
    await expect(
      pool.query('SELECT * FROM registry_migrations.history'),
    ).rejects.toMatchObject({ code: '42501' });
    const locks = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'",
    );
    expect(locks.rows[0]?.count).toBe(0);
    await expect(
      pool.query(
        "UPDATE registry_schema_fingerprint SET fingerprint = repeat('0', 64)",
      ),
    ).rejects.toMatchObject({ code: '42501' });
  }
  const owner = await database.owner.connect();
  try {
    await stampRegistryFingerprint(owner, REGISTRY_SCHEMA_FINGERPRINT);
  } finally {
    owner.release();
  }
  expect(await readRegistrySchemaIdentity(database.pool)).toBe(identity);
});

it.each(['empty', 'stale', 'missing'] as const)(
  'refuses a %s schema with no repair or boot mutation',
  async (state) => {
    const database = await setup();
    if (state === 'empty')
      await database.owner.query('DELETE FROM registry_schema_fingerprint');
    if (state === 'stale')
      await database.owner.query(
        "UPDATE registry_schema_fingerprint SET fingerprint = repeat('0', 64)",
      );
    if (state === 'missing')
      await database.owner.query('DROP TABLE registry_schema_fingerprint');
    await expect(
      verifyRegistryDatabases(database.pool, database.operatorPool),
    ).rejects.toThrow('REGISTRY_SCHEMA_NOT_CURRENT');
    if (state === 'empty')
      expect(
        (
          await database.owner.query(
            'SELECT * FROM registry_schema_fingerprint',
          )
        ).rows,
      ).toEqual([]);
    if (state === 'stale')
      expect(
        (
          await database.owner.query<{ fingerprint: string }>(
            'SELECT fingerprint FROM registry_schema_fingerprint',
          )
        ).rows[0]?.fingerprint,
      ).toBe('0'.repeat(64));
    if (state === 'missing')
      expect(
        (
          await database.owner.query<{ value: string | null }>(
            "SELECT to_regclass('registry_schema_fingerprint') AS value",
          )
        ).rows[0]?.value,
      ).toBeNull();
  },
);

it('refuses a different database, including a restored clone with the same fingerprint and installation ID', async () => {
  const first = await setup();
  const second = await setup();
  await expect(
    verifyRegistryDatabases(first.pool, second.operatorPool),
  ).rejects.toThrow('REGISTRY_DATABASES_DO_NOT_MATCH');
  const identity = await readRegistrySchemaIdentity(first.pool);
  await second.owner.query(
    'UPDATE registry_schema_fingerprint SET instance_id = $1',
    [identity],
  );
  expect(await readRegistrySchemaIdentity(second.operatorPool)).toBe(identity);
  await expect(
    verifyRegistryDatabases(first.pool, second.operatorPool),
  ).rejects.toThrow('REGISTRY_DATABASES_DO_NOT_MATCH');
  expect(await verifyRegistryDatabases(first.pool, first.operatorPool)).toBe(
    identity,
  );
  expect(await verifyRegistryDatabases(second.pool, second.operatorPool)).toBe(
    identity,
  );
});

it.each(['missing', 'view', 'materialized view'] as const)(
  'refuses %s migration history even with a current immutable fingerprint',
  async (kind) => {
    const database = await setup();
    const identity = await readRegistrySchemaIdentity(database.pool);
    await database.owner.query('DROP TABLE registry_migrations.history');
    if (kind !== 'missing') {
      await database.owner.query(
        `CREATE ${kind.toUpperCase()} registry_migrations.history AS SELECT 'forged'::text AS id`,
      );
    }
    for (const pool of [database.pool, database.operatorPool]) {
      await expect(readRegistrySchemaIdentity(pool)).rejects.toThrow(
        'REGISTRY_SCHEMA_NOT_CURRENT',
      );
    }
    expect(
      (
        await database.owner.query(
          'SELECT fingerprint, instance_id FROM registry_schema_fingerprint',
        )
      ).rows,
    ).toEqual([
      { fingerprint: REGISTRY_SCHEMA_FINGERPRINT, instance_id: identity },
    ]);
    expect(
      (
        await database.owner.query<{ kind: string }>(
          "SELECT relation.relkind AS kind FROM pg_catalog.pg_class relation JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace WHERE namespace.nspname = 'registry_migrations' AND relation.relname = 'history'",
        )
      ).rows,
    ).toEqual(
      kind === 'missing' ? [] : [{ kind: kind === 'view' ? 'v' : 'm' }],
    );
  },
);

// Shape admission is shared with Studio and runs before fingerprint reads, on
// restricted runtime sockets that cannot access the migration history schema.
it.each(['fingerprint', 'history'] as const)(
  'refuses a cascading %s relation in migration and runtime admission',
  async (relation) => {
    const database = await setup();
    const table =
      relation === 'history'
        ? 'registry_migrations.history'
        : 'public.registry_schema_fingerprint';
    const column = relation === 'history' ? 'checksum' : 'fingerprint';
    await database.owner
      .query(`CREATE TABLE public.evidence_reference_source (value text PRIMARY KEY);
    INSERT INTO public.evidence_reference_source SELECT ${column} FROM ${table};
    ALTER TABLE ${table} ADD CONSTRAINT evidence_reference_path FOREIGN KEY (${column}) REFERENCES public.evidence_reference_source(value) ON UPDATE CASCADE`);
    await expect(
      registryMigrator.migrate(
        database.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        database.allowedLogins,
      ),
    ).rejects.toThrow('cascading foreign-key action paths');
    for (const pool of [database.pool, database.operatorPool]) {
      await expect(readRegistrySchemaIdentity(pool)).rejects.toThrow(
        'REGISTRY_SCHEMA_NOT_CURRENT',
      );
    }
  },
);
