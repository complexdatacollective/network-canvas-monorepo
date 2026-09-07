import { fileURLToPath } from 'node:url';

import { pushSchema } from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { expect, it } from 'vitest';

import { readMigrations } from '@codaco/studio-sync/postgres-migration-artifacts';
import { createPostgresPool } from '@codaco/studio-sync/postgres-pool';

import { renderRegistrySchema } from '../../scripts/schema.ts';
import { createRegistryFixture } from '../__tests__/fixtures.ts';
import { createRegistryInstallation } from '../__tests__/installation.ts';
import { REGISTRY_SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';
import { registryMigrator } from './migrate.ts';
import { changeRegistryOperator } from './operators.ts';
import {
  readRegistrySchemaIdentity,
  verifyRegistryDatabases,
} from './schema-state.ts';
import { REGISTRY_TABLES } from './schema.ts';

const migrations = await readMigrations(
  fileURLToPath(new URL('../../migrations', import.meta.url)),
  'Template Registry',
);

it('installs the shipped registry schema with real restricted logins and preserves populated behavior on a no-op migration', async () => {
  const installation = await createRegistryInstallation();
  try {
    expect(migrations.length).toBeGreaterThan(0);
    expect((await renderRegistrySchema()).fingerprint).toBe(
      REGISTRY_SCHEMA_FINGERPRINT,
    );
    const preflight = await installation.pool.connect();
    try {
      await expect(
        readRegistrySchemaIdentity(preflight, installation),
      ).rejects.toThrow('REGISTRY_SCHEMA_NOT_CURRENT');
    } finally {
      preflight.release(true);
    }
    // Pending migrations require a drained runtime. Preserve the real
    // pre-install refusal, then observe this probe's socket closing first.
    await expect
      .poll(
        async () =>
          (
            await installation.owner.query<{ drained: boolean }>(
              'SELECT NOT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND usename = $1) AS drained',
              [installation.logins.app],
            )
          ).rows[0]?.drained,
      )
      .toBe(true);
    expect(
      await registryMigrator.migrate(
        installation.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      ),
    ).toEqual(migrations.map(({ manifest }) => manifest.id));
    const identity = await verifyRegistryDatabases(
      installation.pool,
      installation.operatorPool,
      installation,
    );
    const delta = await pushSchema(
      REGISTRY_TABLES,
      drizzle({ client: installation.owner }),
      {
        schemas: ['public'],
        tables: undefined,
        entities: undefined,
        extensions: undefined,
      },
    );
    expect(delta.sqlStatements).toEqual([]);
    const fixture = await createRegistryFixture({}, installation);
    const publisher = await fixture.account();
    const published = await fixture.published(publisher.token);
    await changeRegistryOperator(
      installation.owner,
      publisher.session.userId,
      true,
    );
    const before = (
      await installation.backupPool.query(
        'SELECT * FROM registry_audit ORDER BY occurred_at, id',
      )
    ).rows;
    expect(before.length).toBeGreaterThan(2);
    expect(
      await registryMigrator.migrate(
        installation.owner,
        migrations,
        REGISTRY_SCHEMA_FINGERPRINT,
        installation.allowedLogins,
      ),
    ).toEqual([]);
    expect(
      await verifyRegistryDatabases(
        installation.pool,
        installation.operatorPool,
        installation,
      ),
    ).toEqual(identity);
    expect(
      (
        await installation.backupPool.query(
          'SELECT * FROM registry_audit ORDER BY occurred_at, id',
        )
      ).rows,
    ).toEqual(before);
    expect(
      (await fixture.request('GET', `/entries/${published.entry.id}`)).status,
    ).toBe(200);
    expect(
      (await fixture.request('GET', `/artifacts/${published.entry.root}`))
        .status,
    ).toBe(200);
    expect(
      (
        await installation.backupPool.query(
          'SELECT count(*)::int AS count FROM registry_migrations.history',
        )
      ).rows,
    ).toEqual([{ count: migrations.length }]);
    await expect(
      installation.backupPool.query(
        'UPDATE registry_auth_user SET email_verified = false',
      ),
    ).rejects.toMatchObject({ code: '42501' });
    for (const pool of [installation.pool, installation.operatorPool]) {
      await expect(
        pool.query(
          "UPDATE registry_schema_fingerprint SET fingerprint = repeat('0', 64)",
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        pool.query('SELECT * FROM registry_migrations.history'),
      ).rejects.toMatchObject({ code: '42501' });
      const connection = await pool.connect();
      try {
        await connection.query('SET ROLE NONE');
        await expect(
          connection.query('SELECT * FROM registry_auth_user'),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await connection.query('RESET ROLE');
        connection.release();
      }
    }
  } finally {
    await installation.dispose();
  }
});

it('denies a different installation login CONNECT and refuses source migration metadata tampering', async () => {
  const installation = await createRegistryInstallation();
  const sibling = await createRegistryInstallation();
  const foreignUrl = new URL(sibling.runtimeDatabaseUrl);
  foreignUrl.pathname = `/${installation.databaseName}`;
  const outside = createPostgresPool({
    connectionString: foreignUrl.toString(),
    max: 1,
    onIdleError: () => {
      throw new Error('REGISTRY_TEST_DATABASE_IDLE_ERROR');
    },
  });
  try {
    await expect(outside.query('SELECT 1')).rejects.toMatchObject({
      code: '42501',
    });
    await expect(
      registryMigrator.migrate(
        installation.owner,
        migrations,
        '0'.repeat(64),
        installation.allowedLogins,
      ),
    ).rejects.toThrow('shipped migration history');
    expect(
      (
        await installation.owner.query(
          "SELECT to_regclass('registry_migrations.history') AS history",
        )
      ).rows,
    ).toEqual([{ history: null }]);
  } finally {
    await outside.end();
    await Promise.all([installation.dispose(), sibling.dispose()]);
  }
});
