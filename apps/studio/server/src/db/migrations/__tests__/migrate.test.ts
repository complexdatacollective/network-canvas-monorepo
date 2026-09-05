import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  generateDrizzleJson,
  generateMigration,
  pushSchema,
} from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { escapeIdentifier, Pool } from 'pg';
import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

import { applySchema } from '../../../../scripts/apply.ts';
import {
  createScratchDatabase,
  reachableDb,
} from '../../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../fingerprint.generated.ts';
import { checkSchema, SCHEMA, SIDECARS } from '../../schema.ts';
import {
  jsonHash,
  readMigrations,
  sha256,
  type Migration,
  type MigrationManifest,
} from '../artifact.ts';
import { migrateDatabase } from '../migrate.ts';

const database = await reachableDb();
const directory = fileURLToPath(
  new URL('../../../../migrations', import.meta.url),
);
const shipped = await readMigrations(directory);
const runFile = promisify(execFile);
type Snapshot = Awaited<ReturnType<typeof generateDrizzleJson>>;

function artifact(
  id: string,
  previous: string | null,
  fingerprint: string,
  snapshot: Snapshot,
  sql: string,
): Migration {
  const sidecars = SIDECARS.join('\n') + '\n';
  const manifest: MigrationManifest = {
    format: 1,
    id,
    previous,
    fingerprint,
    snapshotHash: jsonHash(snapshot),
    sqlHash: sha256(sql),
    sidecarsHash: sha256(sidecars),
  };
  return { manifest, snapshot, sql, sidecars, checksum: jsonHash(manifest) };
}

async function withDatabase(
  run: (
    scratch: Awaited<ReturnType<typeof createScratchDatabase>>,
  ) => Promise<void>,
) {
  if (!database)
    throw new Error('Database required for migration integration tests.');
  const scratch = await createScratchDatabase(database);
  try {
    await run(scratch);
  } finally {
    await scratch.dispose();
  }
}

/** Catalog evidence comes from Postgres, not the stored fingerprint. */
async function expectSecurityContract(pool: pg.Pool) {
  // This introspects the actual database and asks the existing Drizzle engine
  // for its delta; a stamped but incomplete schema produces SQL here.
  const delta = await pushSchema(SCHEMA, drizzle({ client: pool }), {
    schemas: ['public'],
    tables: undefined,
    entities: undefined,
    extensions: undefined,
  });
  expect(delta.sqlStatements).toEqual([]);
  const roles = await pool.query<{
    rolname: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
    rolcanlogin: boolean;
  }>(
    `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('studio_app', 'studio_maintenance') ORDER BY rolname`,
  );
  expect(roles.rows).toEqual([
    {
      rolname: 'studio_app',
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: false,
    },
    {
      rolname: 'studio_maintenance',
      rolsuper: false,
      rolbypassrls: false,
      rolcanlogin: false,
    },
  ]);
  const isolation = await pool.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
    policy: boolean;
  }>(
    `SELECT relname, relrowsecurity, relforcerowsecurity,
      EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = relation.oid AND polname = CASE WHEN relation.relname = 'audit_events' THEN 'audit_team_isolation' ELSE 'team_isolation' END) AS policy
      FROM pg_class relation WHERE oid IN ('public.studies'::regclass, 'public.audit_events'::regclass, 'public.nodes'::regclass) ORDER BY relname`,
  );
  expect(isolation.rows).toEqual(
    ['audit_events', 'nodes', 'studies'].map((relname) => ({
      relname,
      relrowsecurity: true,
      relforcerowsecurity: true,
      policy: true,
    })),
  );
  const access = await pool.query<{
    auditUpdate: boolean;
    auditDelete: boolean;
    auditTruncate: boolean;
    exportUpdate: boolean;
    exportConsume: boolean;
    historyWrite: boolean;
  }>(`
    SELECT has_table_privilege('studio_app', 'public.audit_events', 'UPDATE') AS "auditUpdate",
      has_table_privilege('studio_maintenance', 'public.audit_events', 'DELETE') AS "auditDelete",
      has_table_privilege('studio_maintenance', 'public.audit_events', 'TRUNCATE') AS "auditTruncate",
      has_table_privilege('studio_app', 'public.audit_export_jobs', 'UPDATE') AS "exportUpdate",
      has_column_privilege('studio_app', 'public.audit_export_jobs', 'handle_consumed_at', 'UPDATE') AS "exportConsume",
      has_table_privilege('studio_app', 'studio_migrations.history', 'INSERT') AS "historyWrite"
  `);
  expect(access.rows).toEqual([
    {
      auditUpdate: false,
      auditDelete: false,
      auditTruncate: false,
      exportUpdate: false,
      exportConsume: true,
      historyWrite: false,
    },
  ]);
  await pool.query(
    `INSERT INTO teams (id, name, slug) VALUES ('migration-team', 'Migration team', 'migration-team')`,
  );
  const app = await pool.connect();
  try {
    await app.query('BEGIN');
    await app.query('SET LOCAL ROLE studio_app');
    // An immutable audit trigger must still fire for a privileged applier too;
    // here the actual runtime role's grant is the first line of defense.
    await expect(
      app.query('DELETE FROM public.audit_events'),
    ).rejects.toMatchObject({ code: '42501' });
  } finally {
    await app.query('ROLLBACK');
    app.release();
  }
}

describe.skipIf(!database)('explicit Studio migrations', () => {
  let predecessor: Migration;
  let upgrade: Migration;
  beforeAll(async () => {
    // A real earlier schema, generated from the same Drizzle snapshot with the
    // optional user.locale column/check absent. Its migration into today's
    // schema must keep credential users and existing researcher data intact.
    const current = await generateDrizzleJson(SCHEMA);
    const old: Snapshot = {
      ...current,
      ddl: current.ddl.filter(
        (entry) =>
          !(
            (entry.entityType === 'columns' &&
              entry.table === 'user' &&
              entry.name === 'locale') ||
            (entry.entityType === 'checks' &&
              entry.table === 'user' &&
              entry.name === 'user_locale_length_check')
          ),
      ),
    };
    const original = await generateMigration(
      await generateDrizzleJson({}),
      old,
    );
    const oldFingerprint = sha256([...original, ...SIDECARS].join('\n'));
    predecessor = artifact(
      '0001_before_locale',
      null,
      oldFingerprint,
      old,
      original.join('\n'),
    );
    const delta = await generateMigration(old, current);
    expect(delta.join('\n')).toContain('locale');
    upgrade = artifact(
      '0002_add_locale',
      predecessor.manifest.id,
      SCHEMA_FINGERPRINT,
      current,
      delta.join('\n'),
    );
  });

  it.each([true, false])(
    'migrates as a non-superuser database owner (CREATEROLE=%s)',
    async (createRole) => {
      if (!database) throw new Error('Database required.');
      const login = `studio_test_migrator_${randomUUID().replaceAll('-', '')}`;
      const administrator = new Pool({ connectionString: database.url });
      try {
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(login)} LOGIN NOSUPERUSER NOBYPASSRLS ${createRole ? 'CREATEROLE' : 'NOCREATEROLE'} PASSWORD 'migration-test-only'`,
        );
        // Institutions can pre-create the runtime roles. This grant is exactly
        // the documented no-CREATEROLE path, with no admin or superuser power.
        await administrator.query(
          `GRANT studio_app, studio_maintenance TO ${escapeIdentifier(login)} WITH SET TRUE, INHERIT FALSE`,
        );
        await withDatabase(async ({ db, pool }) => {
          const connection = new URL(db.url);
          const databaseName = decodeURIComponent(connection.pathname.slice(1));
          await administrator.query(
            `ALTER DATABASE ${escapeIdentifier(databaseName)} OWNER TO ${escapeIdentifier(login)}`,
          );
          connection.username = login;
          connection.password = 'migration-test-only';
          const owner = new Pool({ connectionString: connection.href });
          try {
            const identity = await owner.query<{
              rolsuper: boolean;
              rolcreaterole: boolean;
            }>(
              'SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user',
            );
            expect(identity.rows).toEqual([
              { rolsuper: false, rolcreaterole: createRole },
            ]);
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT);
            expect(await checkSchema(owner)).toEqual({ kind: 'current' });
            await expectSecurityContract(pool);
          } finally {
            await owner.end();
          }
        });
      } finally {
        await administrator.query(
          `DROP ROLE IF EXISTS ${escapeIdentifier(login)}`,
        );
        await administrator.end();
      }
    },
  );

  it('provisions actual tables, roles, RLS and ordered sidecar privileges on a fresh database', async () => {
    await withDatabase(async ({ pool }) => {
      expect(await migrateDatabase(pool, shipped, SCHEMA_FINGERPRINT)).toEqual(
        shipped.map(({ manifest }) => manifest.id),
      );
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
      await expectSecurityContract(pool);
      const constraints = await pool.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'public."user"'::regclass AND conname = 'user_locale_length_check'`,
      );
      expect(constraints.rows).toEqual([
        { conname: 'user_locale_length_check' },
      ]);
      await expect(
        pool.query(
          `INSERT INTO public."user" (id, name, email, "emailVerified", locale) VALUES ('bad', 'Bad', 'bad@example.test', false, 'x')`,
        ),
      ).rejects.toMatchObject({ constraint: 'user_locale_length_check' });
    });
  });

  it('applies a generated schema upgrade without changing existing users', async () => {
    await withDatabase(async ({ pool }) => {
      await migrateDatabase(
        pool,
        [predecessor],
        predecessor.manifest.fingerprint,
      );
      await pool.query(
        `INSERT INTO public."user" (id, name, email, "emailVerified") VALUES ('owner', 'Original owner', 'owner@example.test', true)`,
      );
      const before = (
        await pool.query(
          'SELECT id, name, email, "emailVerified", "createdAt", "updatedAt" FROM public."user"',
        )
      ).rows;
      expect(before).toHaveLength(1);
      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'mismatch',
      });
      expect(
        await migrateDatabase(pool, [predecessor, upgrade], SCHEMA_FINGERPRINT),
      ).toEqual([upgrade.manifest.id]);
      expect(
        (
          await pool.query(
            'SELECT id, name, email, "emailVerified", "createdAt", "updatedAt" FROM public."user"',
          )
        ).rows,
      ).toEqual(before);
      expect(
        (await pool.query('SELECT locale FROM public."user"')).rows,
      ).toEqual([{ locale: null }]);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
      await expectSecurityContract(pool);
    });
  });

  it('is idempotent without rewriting history or fingerprint timestamps', async () => {
    await withDatabase(async ({ pool }) => {
      await migrateDatabase(pool, shipped, SCHEMA_FINGERPRINT);
      const history = (
        await pool.query(
          'SELECT * FROM studio_migrations.history ORDER BY position',
        )
      ).rows;
      const stamp = (
        await pool.query('SELECT * FROM public."schemaFingerprint"')
      ).rows;
      expect(history).toHaveLength(shipped.length);
      expect(stamp).toHaveLength(1);
      expect(await migrateDatabase(pool, shipped, SCHEMA_FINGERPRINT)).toEqual(
        [],
      );
      expect(
        (
          await pool.query(
            'SELECT * FROM studio_migrations.history ORDER BY position',
          )
        ).rows,
      ).toEqual(history);
      expect(
        (await pool.query('SELECT * FROM public."schemaFingerprint"')).rows,
      ).toEqual(stamp);
    });
  });

  it('serializes separate migration command processes', async () => {
    await withDatabase(async ({ db, pool }) => {
      const entrypoint = fileURLToPath(
        new URL('../../../migrate.ts', import.meta.url),
      );
      const execute = () =>
        runFile(process.execPath, [entrypoint], {
          // These are synthetic credentials for an isolated scratch database.
          // oxlint-disable-next-line node/no-process-env -- child process environment
          env: { PATH: process.env.PATH, DATABASE_URL: db.url },
        });
      const results = await Promise.all([execute(), execute()]);
      expect(
        results
          .map(({ stdout }) => stdout)
          .filter((output) => output.includes('Applied Studio migrations:')),
      ).toHaveLength(1);
      expect(
        results
          .map(({ stdout }) => stdout)
          .filter((output) => output.includes('already current')),
      ).toHaveLength(1);
      expect(
        (await pool.query('SELECT id FROM studio_migrations.history')).rows,
      ).toHaveLength(shipped.length);
    });
  });

  it('refuses developer reconciliation of a versioned database without changing its evidence', async () => {
    await withDatabase(async ({ pool }) => {
      await migrateDatabase(pool, shipped, SCHEMA_FINGERPRINT);
      const history = (
        await pool.query('SELECT * FROM studio_migrations.history')
      ).rows;
      const stamp = (
        await pool.query('SELECT * FROM public."schemaFingerprint"')
      ).rows;
      await expect(applySchema(pool)).rejects.toThrow(
        'refuses a versioned database',
      );
      expect(
        (await pool.query('SELECT * FROM studio_migrations.history')).rows,
      ).toEqual(history);
      expect(
        (await pool.query('SELECT * FROM public."schemaFingerprint"')).rows,
      ).toEqual(stamp);
    });
  });

  it('rejects changed applied history and a newer database before applying anything', async () => {
    await withDatabase(async ({ pool }) => {
      await migrateDatabase(pool, [predecessor, upgrade], SCHEMA_FINGERPRINT);
      await expect(
        migrateDatabase(pool, [predecessor], predecessor.manifest.fingerprint),
      ).rejects.toThrow('downgrade or edited migrations');
      await pool.query(
        `UPDATE studio_migrations.history SET checksum = $1 WHERE position = 1`,
        ['0'.repeat(64)],
      );
      await expect(
        migrateDatabase(pool, [predecessor, upgrade], SCHEMA_FINGERPRINT),
      ).rejects.toThrow('Applied migration history differs');
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('refuses a pre-release database even when it claims the current fingerprint', async () => {
    await withDatabase(async ({ pool }) => {
      await pool.query(shipped[0]!.sql);
      await pool.query(shipped[0]!.sidecars);
      await pool.query(
        `INSERT INTO public."schemaFingerprint" (fingerprint) VALUES ($1)`,
        [SCHEMA_FINGERPRINT],
      );
      await pool.query(
        `INSERT INTO public."user" (id, name, email, "emailVerified") VALUES ('keep', 'Keep me', 'keep@example.test', false)`,
      );
      await expect(
        migrateDatabase(pool, shipped, SCHEMA_FINGERPRINT),
      ).rejects.toThrow('not adopted automatically');
      expect((await pool.query('SELECT name FROM public."user"')).rows).toEqual(
        [{ name: 'Keep me' }],
      );
      expect(
        (
          await pool.query(
            `SELECT to_regclass('studio_migrations.history') AS history`,
          )
        ).rows,
      ).toEqual([{ history: null }]);
    });
  });

  it('refuses a fingerprint inconsistent with otherwise correct history', async () => {
    await withDatabase(async ({ pool }) => {
      await migrateDatabase(pool, shipped, SCHEMA_FINGERPRINT);
      await pool.query(
        'UPDATE public."schemaFingerprint" SET fingerprint = $1',
        ['0'.repeat(64)],
      );
      await expect(
        migrateDatabase(pool, shipped, SCHEMA_FINGERPRINT),
      ).rejects.toThrow('fingerprint does not match');
    });
  });

  it('rolls back schema changes, data changes and evidence when SQL fails', async () => {
    await withDatabase(async ({ pool }) => {
      await migrateDatabase(
        pool,
        [predecessor],
        predecessor.manifest.fingerprint,
      );
      await pool.query(
        `INSERT INTO public."user" (id, name, email, "emailVerified") VALUES ('keep', 'Before', 'keep@example.test', false)`,
      );
      const history = (
        await pool.query('SELECT * FROM studio_migrations.history')
      ).rows;
      const failedSql =
        upgrade.sql +
        `\nUPDATE public."user" SET name = 'Damaged'; SELECT 1/0;`;
      const failedManifest = {
        ...upgrade.manifest,
        sqlHash: sha256(failedSql),
      };
      const failed = {
        ...upgrade,
        manifest: failedManifest,
        checksum: jsonHash(failedManifest),
        sql: failedSql,
      };
      await expect(
        migrateDatabase(pool, [predecessor, failed], SCHEMA_FINGERPRINT),
      ).rejects.toMatchObject({ code: '22012' });
      expect((await pool.query('SELECT name FROM public."user"')).rows).toEqual(
        [{ name: 'Before' }],
      );
      expect(
        (await pool.query('SELECT * FROM studio_migrations.history')).rows,
      ).toEqual(history);
      expect(
        (
          await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'locale'`,
          )
        ).rows,
      ).toEqual([]);
      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        found: predecessor.manifest.fingerprint,
      });
    });
  });

  it.each(['SUPERUSER', 'BYPASSRLS', 'LOGIN'])(
    'refuses a pre-created runtime role with %s privileges before stamping the migration',
    async (unsafeFlag) => {
      if (!database) throw new Error('Database required.');
      const suffix = randomUUID().replaceAll('-', '');
      const appRole = `studio_test_app_${suffix}`;
      const maintenanceRole = `studio_test_maintenance_${suffix}`;
      const administrator = new Pool({ connectionString: database.url });
      try {
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(appRole)} ${unsafeFlag === 'LOGIN' ? 'LOGIN' : 'NOLOGIN'} ${unsafeFlag === 'SUPERUSER' ? 'SUPERUSER' : 'NOSUPERUSER'} ${unsafeFlag === 'BYPASSRLS' ? 'BYPASSRLS' : 'NOBYPASSRLS'}`,
        );
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(maintenanceRole)} NOLOGIN NOSUPERUSER NOBYPASSRLS`,
        );
        await withDatabase(async ({ pool }) => {
          const initial = shipped[0]!;
          // Roles are cluster-wide. Isolated names exercise the exact shipped
          // sidecars without weakening roles used by concurrent suites.
          const sidecars = initial.sidecars
            .replaceAll('studio_app', appRole)
            .replaceAll('studio_maintenance', maintenanceRole);
          const manifest = {
            ...initial.manifest,
            sidecarsHash: sha256(sidecars),
          };
          const isolated = {
            ...initial,
            manifest,
            checksum: jsonHash(manifest),
            sidecars,
          };
          await expect(
            migrateDatabase(pool, [isolated], initial.manifest.fingerprint),
          ).rejects.toThrow('Studio runtime roles');
          expect(
            (
              await pool.query(
                `SELECT to_regclass('studio_migrations.history') AS history, to_regclass('public.teams') AS teams`,
              )
            ).rows,
          ).toEqual([{ history: null, teams: null }]);
        });
      } finally {
        await administrator.query(
          `DROP ROLE IF EXISTS ${escapeIdentifier(appRole)}, ${escapeIdentifier(maintenanceRole)}`,
        );
        await administrator.end();
      }
    },
  );

  it.each([
    { command: 'COMMIT', part: 'sql', code: '0A000' },
    { command: 'ROLLBACK', part: 'sql', code: '0A000' },
    { command: 'COMMIT', part: 'sidecars', code: '0A000' },
    { command: 'DO $$ BEGIN COMMIT; END $$', part: 'sql', code: '2D000' },
  ])(
    'contains authored $command in $part so it cannot escape the migration transaction',
    async ({ command, part, code }) => {
      await withDatabase(async ({ pool }) => {
        await migrateDatabase(
          pool,
          [predecessor],
          predecessor.manifest.fingerprint,
        );
        await pool.query(
          `INSERT INTO public."user" (id, name, email, "emailVerified") VALUES ('keep', 'Before', 'keep@example.test', false)`,
        );
        const history = (
          await pool.query('SELECT * FROM studio_migrations.history')
        ).rows;
        const appended = `\nUPDATE public."user" SET name = 'Damaged'; ${command};`;
        const sql = upgrade.sql + (part === 'sql' ? appended : '');
        const sidecars =
          upgrade.sidecars + (part === 'sidecars' ? appended : '');
        const manifest = {
          ...upgrade.manifest,
          sqlHash: sha256(sql),
          sidecarsHash: sha256(sidecars),
        };
        const escaped = {
          ...upgrade,
          manifest,
          checksum: jsonHash(manifest),
          sql,
          sidecars,
        };
        await expect(
          migrateDatabase(pool, [predecessor, escaped], SCHEMA_FINGERPRINT),
        ).rejects.toMatchObject({ code });
        expect(
          (await pool.query('SELECT name FROM public."user"')).rows,
        ).toEqual([{ name: 'Before' }]);
        expect(
          (await pool.query('SELECT * FROM studio_migrations.history')).rows,
        ).toEqual(history);
        expect(
          (
            await pool.query(
              `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user' AND column_name = 'locale'`,
            )
          ).rows,
        ).toEqual([]);
        expect(await checkSchema(pool)).toMatchObject({
          kind: 'stale',
          found: predecessor.manifest.fingerprint,
        });
      });
    },
  );
});
