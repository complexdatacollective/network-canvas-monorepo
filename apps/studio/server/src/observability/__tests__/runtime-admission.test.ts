import { spawnSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BACKUP_ROLE } from '@codaco/studio-sync/rls';
import { runtimeRolesSql } from '@codaco/studio-sync/role-bootstrap';

import {
  createScratchDatabase,
  reachableDb,
} from '../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../db/fingerprint.generated.ts';
import { readMigrations } from '../../db/migrations/artifact.ts';
import { migrateDatabase } from '../../db/migrations/migrate.ts';
import {
  createPool,
  createMaintenancePool,
  createOwnerPool,
} from '../../db/pool.ts';
import { checkSchema } from '../../db/schema.ts';
import { createReadiness } from '../readiness.ts';

const database = await reachableDb();
const suffix = randomUUID().replaceAll('-', '');
const appRuntimeLogin = `admission_app_${suffix}`;
const maintenanceRuntimeLogin = `admission_maintenance_${suffix}`;
const outsideLogin = `admission_outside_${suffix}`;
const password = 'admission-synthetic-local-only';

describe.skipIf(!database)(
  'production admission against privilege drift',
  () => {
    let scratch: Awaited<ReturnType<typeof createScratchDatabase>>;
    let runtime: ReturnType<typeof createPool>;
    let maintenance: ReturnType<typeof createMaintenancePool>;
    let allowedLogins: string[];
    let appRuntimeUrl: string;
    let maintenanceRuntimeUrl: string;
    let databaseName: string;
    const evidenceLockNamespace = randomInt(1, 2 ** 31);
    let evidenceLockVersion = 0;

    // A session lock is visible to the independent observer and works inside
    // read-only probes. Each reset uses a fresh key, so pooled sessions cannot
    // carry an earlier read into a later assertion.
    const resetEvidenceReadCanary = async () => {
      evidenceLockVersion += 1;
      await scratch.pool.query(
        `ALTER POLICY evidence_read_canary ON "schemaFingerprint" USING (pg_try_advisory_lock(${evidenceLockNamespace}, ${evidenceLockVersion}) IS NOT NULL)`,
      );
    };
    const readEvidenceReadCanary = async () =>
      (
        await scratch.pool.query<{ is_called: boolean }>(
          `SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory'
          AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
          AND classid = $1::oid AND objid = $2::oid AND objsubid = 2) AS is_called`,
          [evidenceLockNamespace, evidenceLockVersion],
        )
      ).rows;

    beforeAll(async () => {
      if (!database)
        throw new Error('PostgreSQL is required for admission controls.');
      scratch = await createScratchDatabase(database);
      const identity = (
        await scratch.pool.query<{ login: string; database: string }>(
          'SELECT session_user AS login, current_database() AS database',
        )
      ).rows[0]!;
      databaseName = identity.database;
      const migrations = await readMigrations(
        fileURLToPath(new URL('../../../migrations', import.meta.url)),
      );
      await migrateDatabase(scratch.pool, migrations, SCHEMA_FINGERPRINT, [
        identity.login,
      ]);
      for (const [login, role] of [
        [appRuntimeLogin, 'studio_app'],
        [maintenanceRuntimeLogin, 'studio_maintenance'],
        [outsideLogin, 'studio_app'],
      ] as const) {
        await scratch.pool
          .query(`CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}';
        GRANT ${role} TO ${escapeIdentifier(login)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
      }
      await scratch.pool
        .query(`GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(appRuntimeLogin)}, ${escapeIdentifier(maintenanceRuntimeLogin)};
      ALTER TABLE "schemaFingerprint" ENABLE ROW LEVEL SECURITY;
      CREATE POLICY evidence_read_canary ON "schemaFingerprint" FOR SELECT TO studio_app, studio_maintenance USING (pg_try_advisory_lock(${evidenceLockNamespace}, ${evidenceLockVersion}) IS NOT NULL);
      CREATE POLICY evidence_write_control ON "schemaFingerprint" FOR UPDATE TO studio_app, studio_maintenance USING (true) WITH CHECK (true)`);
      allowedLogins = [
        identity.login,
        appRuntimeLogin,
        maintenanceRuntimeLogin,
      ];
      const appUrl = new URL(scratch.db.url);
      appUrl.username = appRuntimeLogin;
      appUrl.password = password;
      appRuntimeUrl = appUrl.href;
      const maintenanceUrl = new URL(scratch.db.url);
      maintenanceUrl.username = maintenanceRuntimeLogin;
      maintenanceUrl.password = password;
      maintenanceRuntimeUrl = maintenanceUrl.href;
      runtime = createPool({ url: appRuntimeUrl });
      maintenance = createMaintenancePool({ url: maintenanceRuntimeUrl });
    });
    afterAll(async () => {
      await Promise.all([runtime.end(), maintenance.end()]);
      await scratch.dispose();
      if (!database) return;
      const cleanup = createOwnerPool(database);
      const client = await cleanup.connect();
      try {
        await client.query(
          `DROP ROLE ${escapeIdentifier(appRuntimeLogin)}, ${escapeIdentifier(maintenanceRuntimeLogin)}, ${escapeIdentifier(outsideLogin)}`,
        );
      } finally {
        client.release();
        await cleanup.end();
      }
    });

    const readiness = (logins: readonly string[] = allowedLogins) =>
      createReadiness({
        pool: runtime,
        maintenancePool: maintenance,
        allowedLogins: logins,
        cacheMs: 0,
        assetStore: {
          checkHealth: async () => {},
          put: async () => {
            throw new Error('unused');
          },
          get: async () => null,
        },
      });
    const boot = (
      logins: readonly string[] | null = allowedLogins,
      administrativeLogins: readonly string[] = [],
      maintenanceDatabaseUrl: string | null = maintenanceRuntimeUrl,
    ) =>
      spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `await import(${JSON.stringify(new URL('../../index.ts', import.meta.url).href)}); console.log('admission-listener-started'); process.exit(0);`,
        ],
        {
          env: {
            NODE_ENV: 'production',
            DATABASE_URL: appRuntimeUrl,
            ...(maintenanceDatabaseUrl
              ? {
                  STUDIO_MAINTENANCE_DATABASE_URL: maintenanceDatabaseUrl,
                }
              : {}),
            BETTER_AUTH_SECRET:
              'admission-local-signing-secret-at-least-32-characters',
            PUBLIC_URL: 'http://127.0.0.1:3000',
            PORT: '0',
            HOST: '127.0.0.1',
            STUDIO_TELEMETRY: 'false',
            STUDIO_DATABASE_ADMINISTRATIVE_LOGINS:
              JSON.stringify(administrativeLogins),
            ...(logins
              ? { STUDIO_DATABASE_ALLOWED_LOGINS: JSON.stringify(logins) }
              : {}),
          },
          encoding: 'utf8',
          timeout: 10_000,
        },
      );

    it('admits the actual app and maintenance connections while keeping history unreadable', async () => {
      for (const pool of [runtime, maintenance]) {
        expect(await checkSchema(pool, { allowedLogins })).toEqual({
          kind: 'current',
        });
        expect(await readEvidenceReadCanary()).toEqual([{ is_called: true }]);
        await expect(
          pool.query('SELECT * FROM studio_migrations.history'),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        runtime.query('SET ROLE studio_maintenance'),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        maintenance.query('SET ROLE studio_app'),
      ).rejects.toMatchObject({ code: '42501' });
      const probe = readiness();
      try {
        expect((await probe.check()).status).toBe('ready');
      } finally {
        probe.stop();
      }
      const result = boot();
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('admission-listener-started');
    });

    it('requires app and maintenance connections to reach the same live database', async () => {
      if (!database) throw new Error('PostgreSQL is required.');
      const other = await createScratchDatabase(database);
      let otherMaintenance:
        | ReturnType<typeof createMaintenancePool>
        | undefined;
      try {
        const migrations = await readMigrations(
          fileURLToPath(new URL('../../../migrations', import.meta.url)),
        );
        await migrateDatabase(other.pool, migrations, SCHEMA_FINGERPRINT, [
          allowedLogins[0]!,
        ]);
        const otherName = decodeURIComponent(
          new URL(other.db.url).pathname.slice(1),
        );
        await other.pool.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(otherName)} TO ${escapeIdentifier(appRuntimeLogin)}, ${escapeIdentifier(maintenanceRuntimeLogin)}`,
        );
        const url = new URL(other.db.url);
        url.username = maintenanceRuntimeLogin;
        url.password = password;
        otherMaintenance = createMaintenancePool({ url: url.href });
        expect(await checkSchema(otherMaintenance, { allowedLogins })).toEqual({
          kind: 'current',
        });
        expect(await checkSchema(runtime, { allowedLogins })).toEqual({
          kind: 'current',
        });
        const probe = createReadiness({
          pool: runtime,
          maintenancePool: otherMaintenance,
          allowedLogins,
          cacheMs: 0,
          assetStore: {
            checkHealth: async () => {},
            put: async () => {
              throw new Error('unused');
            },
            get: async () => null,
          },
        });
        try {
          expect((await probe.check()).status).toBe('not_ready');
        } finally {
          probe.stop();
        }
        const result = boot(allowedLogins, [], url.href);
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stdout).toContain('STUDIO_DATABASE_IDENTITY_UNSAFE');
        expect(result.stdout).not.toContain('admission-listener-started');
        const healthy = readiness();
        try {
          expect((await healthy.check()).status).toBe('ready');
        } finally {
          healthy.stop();
        }
        for (const pool of [runtime, otherMaintenance])
          expect(
            (
              await pool.query(
                "SELECT count(*)::int AS locks FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory' AND objsubid = 1",
              )
            ).rows,
          ).toEqual([{ locks: 0 }]);
      } finally {
        await otherMaintenance?.end();
        await other.dispose();
      }
    }, 30_000);

    it.each(['studio_app', 'studio_maintenance'] as const)(
      'rejects actual %s column-level fingerprint forgery before reading evidence',
      async (role) => {
        await scratch.pool.query(
          `GRANT UPDATE(fingerprint) ON "schemaFingerprint" TO ${role}`,
        );
        try {
          const pool = role === 'studio_app' ? runtime : maintenance;
          expect(
            (
              await pool.query(
                'UPDATE "schemaFingerprint" SET fingerprint = $1',
                [SCHEMA_FINGERPRINT],
              )
            ).rowCount,
          ).toBe(1);
          await resetEvidenceReadCanary();
          expect(await checkSchema(pool, { allowedLogins })).toMatchObject({
            kind: 'stale',
            reason: 'unsafe-evidence',
            found: null,
          });
          expect(await readEvidenceReadCanary()).toEqual([
            { is_called: false },
          ]);
          const probe = readiness();
          try {
            expect((await probe.check()).status).toBe('not_ready');
          } finally {
            probe.stop();
          }
          const result = boot();
          expect(result.error).toBeUndefined();
          expect(result.status).toBe(1);
          expect(result.stdout).toContain('STUDIO_SCHEMA_STALE');
          expect(result.stdout).not.toContain('admission-listener-started');
        } finally {
          await scratch.pool.query(
            `REVOKE UPDATE(fingerprint) ON "schemaFingerprint" FROM ${role}`,
          );
        }
      },
    );

    it.each(['trigger', 'rewrite'] as const)(
      'rejects owner-backed %s forgery with fingerprint ACLs intact',
      async (mechanism) => {
        await scratch.pool.query(`CREATE TABLE evidence_write_path (id integer);
      INSERT INTO evidence_write_path VALUES (0);
      GRANT UPDATE ON evidence_write_path TO studio_app`);
        try {
          if (mechanism === 'trigger') {
            await scratch.pool
              .query(`CREATE FUNCTION evidence_owner_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
          SET search_path = pg_catalog AS $body$ BEGIN
            UPDATE public."schemaFingerprint" SET fingerprint = '${SCHEMA_FINGERPRINT}';
            RETURN NEW; END $body$;
          REVOKE ALL ON FUNCTION evidence_owner_write() FROM PUBLIC, studio_app, studio_maintenance;
          CREATE TRIGGER evidence_owner_write AFTER UPDATE ON evidence_write_path FOR EACH ROW EXECUTE FUNCTION evidence_owner_write()`);
            expect(
              (
                await runtime.query(
                  "SELECT has_function_privilege(current_user, 'evidence_owner_write()', 'EXECUTE') AS held",
                )
              ).rows,
            ).toEqual([{ held: false }]);
          } else {
            await scratch.pool
              .query(`CREATE RULE evidence_owner_write AS ON UPDATE TO evidence_write_path DO ALSO
          UPDATE public."schemaFingerprint" SET fingerprint = '${SCHEMA_FINGERPRINT}'`);
          }
          await scratch.pool.query(
            'UPDATE "schemaFingerprint" SET fingerprint = $1',
            ['old'],
          );
          expect(
            (await runtime.query('UPDATE evidence_write_path SET id = 1'))
              .rowCount,
          ).toBe(1);
          expect(
            (
              await scratch.pool.query(
                'SELECT fingerprint FROM "schemaFingerprint"',
              )
            ).rows,
          ).toEqual([{ fingerprint: SCHEMA_FINGERPRINT }]);
          expect(
            (
              await runtime.query(
                `SELECT has_table_privilege(current_user, '"schemaFingerprint"', 'UPDATE') AS held`,
              )
            ).rows,
          ).toEqual([{ held: false }]);
          await resetEvidenceReadCanary();
          expect(await checkSchema(runtime, { allowedLogins })).toMatchObject({
            kind: 'stale',
            reason: 'unsafe-evidence',
          });
          expect(await readEvidenceReadCanary()).toEqual([
            { is_called: false },
          ]);
        } finally {
          await scratch.pool.query(
            'DROP TABLE evidence_write_path CASCADE; DROP FUNCTION IF EXISTS evidence_owner_write()',
          );
        }
      },
    );
    it('rejects history writes and arbitrary enrolled login writes independently of the current runtime role', async () => {
      await scratch.pool
        .query(`GRANT UPDATE ON studio_migrations.history TO studio_maintenance;
      GRANT UPDATE(fingerprint) ON "schemaFingerprint" TO ${escapeIdentifier(appRuntimeLogin)}`);
      try {
        expect(await checkSchema(runtime, { allowedLogins })).toMatchObject({
          kind: 'stale',
          reason: 'unsafe-evidence',
        });
        await scratch.pool.query(
          'REVOKE UPDATE ON studio_migrations.history FROM studio_maintenance',
        );
        expect(await checkSchema(runtime, { allowedLogins })).toMatchObject({
          kind: 'stale',
          reason: 'unsafe-evidence',
        });
      } finally {
        await scratch.pool
          .query(`REVOKE UPDATE ON studio_migrations.history FROM studio_maintenance;
        REVOKE UPDATE(fingerprint) ON "schemaFingerprint" FROM ${escapeIdentifier(appRuntimeLogin)}`);
      }
    });

    it.each(['runtime', 'backup'] as const)(
      'refuses direct data grants held by another enrolled %s login',
      async (kind) => {
        await scratch.pool.query(runtimeRolesSql([BACKUP_ROLE]));
        const enrolled = [...allowedLogins, outsideLogin];
        await scratch.pool
          .query(`GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(outsideLogin)};
          CREATE TABLE enrollment_data_canary (id integer, changed boolean);
          INSERT INTO enrollment_data_canary VALUES (1, false);
          GRANT UPDATE(changed) ON enrollment_data_canary TO ${escapeIdentifier(outsideLogin)}`);
        if (kind === 'backup')
          await scratch.pool
            .query(`REVOKE studio_app, studio_maintenance FROM ${escapeIdentifier(outsideLogin)};
            GRANT ${BACKUP_ROLE} TO ${escapeIdentifier(outsideLogin)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
        const otherUrl = new URL(appRuntimeUrl);
        otherUrl.username = outsideLogin;
        const other = createOwnerPool({ url: otherUrl.href });
        try {
          expect(
            (
              await other.query(
                'UPDATE enrollment_data_canary SET changed = true',
              )
            ).rowCount,
          ).toBe(1);
          await resetEvidenceReadCanary();
          const schema = await checkSchema(runtime, {
            allowedLogins: enrolled,
          });
          const probe = readiness(enrolled);
          let health: string;
          try {
            health = (await probe.check()).status;
          } finally {
            probe.stop();
          }
          const result = boot(enrolled);
          expect(result.error).toBeUndefined();
          expect({
            schema: schema.kind,
            health,
            exit: result.status,
            listener: result.stdout.includes('admission-listener-started'),
            readEvidence: (await readEvidenceReadCanary())[0]?.is_called,
          }).toEqual({
            schema: 'stale',
            health: 'not_ready',
            exit: 1,
            listener: false,
            readEvidence: false,
          });
        } finally {
          await other.end();
          await scratch.pool.query(`DROP TABLE enrollment_data_canary;
            REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM ${escapeIdentifier(outsideLogin)}`);
          if (kind === 'backup')
            await scratch.pool
              .query(`REVOKE ${BACKUP_ROLE} FROM ${escapeIdentifier(outsideLogin)};
              GRANT studio_app TO ${escapeIdentifier(outsideLogin)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
        }
      },
    );

    it.each(['studio_app', 'studio_maintenance'] as const)(
      'refuses an owner-backed automatically updatable evidence view granted to %s',
      async (role) => {
        await scratch.pool
          .query(`CREATE VIEW evidence_owner_view AS SELECT fingerprint FROM "schemaFingerprint";
          GRANT UPDATE(fingerprint) ON evidence_owner_view TO ${role};
          UPDATE "schemaFingerprint" SET fingerprint = 'untrusted-before-view-write'`);
        try {
          const pool = role === 'studio_app' ? runtime : maintenance;
          expect(
            (
              await pool.query(
                'UPDATE evidence_owner_view SET fingerprint = $1',
                [SCHEMA_FINGERPRINT],
              )
            ).rowCount,
          ).toBe(1);
          expect(
            (
              await pool.query(
                `SELECT has_any_column_privilege(current_user, '"schemaFingerprint"', 'UPDATE') AS writable`,
              )
            ).rows,
          ).toEqual([{ writable: false }]);
          await resetEvidenceReadCanary();
          const schema = await checkSchema(pool, { allowedLogins });
          const probe = readiness();
          let health: string;
          try {
            health = (await probe.check()).status;
          } finally {
            probe.stop();
          }
          const result = boot();
          expect(result.error).toBeUndefined();
          expect({
            schema: schema.kind,
            health,
            exit: result.status,
            listener: result.stdout.includes('admission-listener-started'),
            readEvidence: (await readEvidenceReadCanary())[0]?.is_called,
          }).toEqual({
            schema: 'stale',
            health: 'not_ready',
            exit: 1,
            listener: false,
            readEvidence: false,
          });
        } finally {
          await scratch.pool.query('DROP VIEW evidence_owner_view');
        }
      },
    );

    it('refuses a configured administrative serving login despite otherwise-safe runtime capabilities', async () => {
      const administrativeLogins = [appRuntimeLogin];
      const probe = createReadiness({
        pool: runtime,
        maintenancePool: maintenance,
        allowedLogins,
        administrativeLogins,
        cacheMs: 0,
      });
      try {
        expect((await probe.check()).status).toBe('not_ready');
      } finally {
        probe.stop();
      }
      const result = boot(allowedLogins, administrativeLogins);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('STUDIO_DATABASE_IDENTITY_UNSAFE');
      expect(result.stdout).not.toContain('admission-listener-started');
    });

    it('refuses outside CONNECT drift at schema, readiness and actual startup admission', async () => {
      await scratch.pool.query(
        `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(outsideLogin)}`,
      );
      try {
        expect(await checkSchema(runtime, { allowedLogins })).toMatchObject({
          kind: 'stale',
          reason: 'unsafe-evidence',
        });
        const probe = readiness();
        try {
          expect((await probe.check()).status).toBe('not_ready');
        } finally {
          probe.stop();
        }
        const result = boot();
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stdout).not.toContain('admission-listener-started');
      } finally {
        await scratch.pool.query(
          `REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM ${escapeIdentifier(outsideLogin)}`,
        );
      }
    });

    it('refuses a sibling maintenance-role grant before readiness or startup can admit app traffic', async () => {
      await scratch.pool.query(
        `GRANT studio_maintenance TO ${escapeIdentifier(appRuntimeLogin)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
      try {
        expect(
          (await runtime.query('SET ROLE studio_maintenance')).rows,
        ).toEqual([]);
        await runtime.query('SET ROLE studio_app');
        const probe = readiness();
        try {
          expect((await probe.check()).status).toBe('not_ready');
        } finally {
          probe.stop();
        }
        const result = boot();
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stdout).not.toContain('admission-listener-started');
        const reusedLogin = boot(allowedLogins, [], appRuntimeUrl);
        expect(reusedLogin.error).toBeUndefined();
        expect(reusedLogin.status).toBe(1);
        expect(reusedLogin.stdout).not.toContain('admission-listener-started');
      } finally {
        await scratch.pool.query(
          `REVOKE studio_maintenance FROM ${escapeIdentifier(appRuntimeLogin)}`,
        );
      }
    });

    it('fails closed before evidence reads when production enrollment is missing', async () => {
      await resetEvidenceReadCanary();
      expect(await checkSchema(runtime)).toMatchObject({
        kind: 'stale',
        reason: 'unsafe-evidence',
      });
      expect(await readEvidenceReadCanary()).toEqual([{ is_called: false }]);
      const missing = boot(null);
      expect(missing.error).toBeUndefined();
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain('STUDIO_CONFIGURATION_INVALID');
      expect(missing.stdout).not.toContain('admission-listener-started');
    });

    it('fails closed before request admission when the maintenance connection is missing', () => {
      const missing = boot(allowedLogins, [], null);
      expect(missing.error).toBeUndefined();
      expect(missing.status).toBe(1);
      expect(missing.stdout).toContain('STUDIO_CONFIGURATION_INVALID');
      expect(missing.stdout).not.toContain('admission-listener-started');
    });
  },
);

it('admits healthy runtime evidence authored by a distinct enrolled non-superuser migration operator', async () => {
  if (!database)
    throw new Error('PostgreSQL is required for admission controls.');
  const scratch = await createScratchDatabase(database);
  const unique = randomUUID().replaceAll('-', '');
  const migrationLogin = `separate_migrator_${unique}`;
  const separateRuntimeLogin = `separate_runtime_${unique}`;
  const separateMaintenanceLogin = `separate_maintenance_${unique}`;
  const ownerName = (
    await scratch.pool.query<{ login: string }>('SELECT session_user AS login')
  ).rows[0]!.login;
  const databaseName = decodeURIComponent(
    new URL(scratch.db.url).pathname.slice(1),
  );
  const operatorUrl = new URL(scratch.db.url);
  operatorUrl.username = migrationLogin;
  operatorUrl.password = password;
  const runtimeUrl = new URL(operatorUrl);
  runtimeUrl.username = separateRuntimeLogin;
  const maintenanceUrl = new URL(operatorUrl);
  maintenanceUrl.username = separateMaintenanceLogin;
  const operator = createOwnerPool({ url: operatorUrl.href });
  const runtime = createPool({ url: runtimeUrl.href });
  const maintenance = createMaintenancePool({ url: maintenanceUrl.href });
  const allowedLogins = [
    ownerName,
    migrationLogin,
    separateRuntimeLogin,
    separateMaintenanceLogin,
  ];
  const administrativeLogins = [migrationLogin];
  const scopedOperator = createMaintenancePool({ url: operatorUrl.href });
  const migrationCommand = (administrators?: readonly string[]) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('../../migrate.ts', import.meta.url))],
      {
        env: {
          DATABASE_URL: operatorUrl.href,
          STUDIO_DATABASE_ALLOWED_LOGINS: JSON.stringify(allowedLogins),
          ...(administrators
            ? {
                STUDIO_DATABASE_ADMINISTRATIVE_LOGINS:
                  JSON.stringify(administrators),
              }
            : {}),
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
  try {
    for (const [login, grantedRoles] of [
      [migrationLogin, 'studio_app, studio_maintenance'],
      [separateRuntimeLogin, 'studio_app'],
      [separateMaintenanceLogin, 'studio_maintenance'],
    ] as const)
      await scratch.pool
        .query(`CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}';
        GRANT ${grantedRoles} TO ${escapeIdentifier(login)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`);
    await scratch.pool
      .query(`GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${[migrationLogin, separateRuntimeLogin, separateMaintenanceLogin].map(escapeIdentifier).join(', ')};
      GRANT CREATE ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(migrationLogin)};
      GRANT USAGE, CREATE ON SCHEMA public TO ${escapeIdentifier(migrationLogin)}`);
    const undeclared = migrationCommand();
    expect(undeclared.error).toBeUndefined();
    expect(undeclared.status).toBe(1);
    expect(undeclared.stderr).toContain(
      'STUDIO_DATABASE_ADMINISTRATIVE_LOGINS',
    );
    expect(undeclared.stderr).not.toContain(migrationLogin);
    expect(
      (
        await scratch.pool.query(
          "SELECT to_regclass('studio_migrations.history') AS history",
        )
      ).rows,
    ).toEqual([{ history: null }]);
    const migrations = await readMigrations(
      fileURLToPath(new URL('../../../migrations', import.meta.url)),
    );
    expect(
      await migrateDatabase(
        operator,
        migrations,
        SCHEMA_FINGERPRINT,
        allowedLogins,
      ),
    ).toEqual(migrations.map(({ manifest }) => manifest.id));
    expect(
      (
        await operator.query(
          `SELECT session_user <> pg_get_userbyid(datdba) AS separate, NOT rolsuper AS restricted FROM pg_database JOIN pg_roles ON rolname = session_user WHERE datname = current_database()`,
        )
      ).rows,
    ).toEqual([{ separate: true, restricted: true }]);
    expect(await checkSchema(runtime, { allowedLogins })).toMatchObject({
      kind: 'stale',
      reason: 'unsafe-evidence',
    });
    expect(
      await checkSchema(runtime, { allowedLogins, administrativeLogins }),
    ).toEqual({ kind: 'current' });
    expect(
      await checkSchema(operator, { allowedLogins, administrativeLogins }),
    ).toEqual({ kind: 'current' });
    expect(
      await checkSchema(scopedOperator, {
        allowedLogins,
        administrativeLogins,
      }),
    ).toMatchObject({ kind: 'stale', reason: 'unsafe-evidence' });
    const configured = migrationCommand(administrativeLogins);
    expect(configured.error).toBeUndefined();
    expect(configured.status).toBe(0);
    expect(configured.stdout).toContain('already current');
    const probe = createReadiness({
      pool: runtime,
      maintenancePool: maintenance,
      allowedLogins,
      administrativeLogins,
      cacheMs: 0,
      assetStore: {
        checkHealth: async () => {},
        put: async () => {
          throw new Error('unused');
        },
        get: async () => null,
      },
    });
    try {
      expect((await probe.check()).status).toBe('ready');
    } finally {
      probe.stop();
    }
    const boot = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(new URL('../../index.ts', import.meta.url).href)}); console.log('distinct-administrator-runtime-started'); process.exit(0);`,
      ],
      {
        env: {
          NODE_ENV: 'production',
          DATABASE_URL: runtimeUrl.href,
          STUDIO_MAINTENANCE_DATABASE_URL: maintenanceUrl.href,
          STUDIO_DATABASE_ALLOWED_LOGINS: JSON.stringify(allowedLogins),
          STUDIO_DATABASE_ADMINISTRATIVE_LOGINS:
            JSON.stringify(administrativeLogins),
          BETTER_AUTH_SECRET:
            'distinct-administrator-local-secret-at-least-32-characters',
          PUBLIC_URL: 'http://127.0.0.1:3000',
          HOST: '127.0.0.1',
          PORT: '0',
          STUDIO_TELEMETRY: 'false',
        },
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    expect(boot.error).toBeUndefined();
    expect(boot.status).toBe(0);
    expect(boot.stdout).toContain('distinct-administrator-runtime-started');
    // Configuring the actual serving login as administrative cannot hide its direct writes.
    await operator.query(
      `GRANT UPDATE(fingerprint) ON "schemaFingerprint" TO ${escapeIdentifier(separateRuntimeLogin)}`,
    );
    const serving = await runtime.connect();
    try {
      await serving.query('SET ROLE NONE');
      expect(
        (
          await serving.query(
            'UPDATE "schemaFingerprint" SET fingerprint = $1',
            [SCHEMA_FINGERPRINT],
          )
        ).rowCount,
      ).toBe(1);
      await serving.query('SET ROLE studio_app');
      expect(
        await checkSchema(serving, {
          allowedLogins,
          administrativeLogins: [migrationLogin, separateRuntimeLogin],
        }),
      ).toMatchObject({ kind: 'stale', reason: 'unsafe-evidence' });
    } finally {
      serving.release();
    }
  } finally {
    await Promise.all([
      operator.end(),
      runtime.end(),
      maintenance.end(),
      scopedOperator.end(),
    ]);
    await scratch.dispose();
    const cleanup = createOwnerPool(database);
    try {
      await cleanup.query(
        `DROP ROLE IF EXISTS ${[migrationLogin, separateRuntimeLogin, separateMaintenanceLogin].map(escapeIdentifier).join(', ')}`,
      );
    } finally {
      await cleanup.end();
    }
  }
});
