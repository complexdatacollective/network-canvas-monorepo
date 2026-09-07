import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { escapeIdentifier, Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  jsonHash,
  readMigrations,
  sha256,
  type Migration,
} from '@codaco/studio-sync/postgres-migration-artifacts';
import { BACKUP_ROLE } from '@codaco/studio-sync/rls';
import {
  runtimeRolesSql,
  revokeLargeObjectPrivilegesSql,
} from '@codaco/studio-sync/role-bootstrap';

import {
  createScratchDatabase,
  reachableDb,
} from '../../../__tests__/support/postgres.ts';
import { SCHEMA_FINGERPRINT } from '../../fingerprint.generated.ts';
import { enforceMigrationSecurity, migrateDatabase } from '../migrate.ts';

const database = await reachableDb();
const shipped = await readMigrations(
  fileURLToPath(new URL('../../../../migrations', import.meta.url)),
);
const password = 'isolated-migration-security-test';

async function withDeployment(
  run: (deployment: {
    administrator: Pool;
    owner: Pool;
    url: URL;
    logins: [string, string];
    databaseName: string;
  }) => Promise<void>,
) {
  if (!database)
    throw new Error('Database required for migration security tests.');
  // Quoted, deployment-specific identities exercise actual SQL identifier handling.
  const suffix = randomUUID().replaceAll('-', '');
  const logins: [string, string] = [`migrator-${suffix}`, `runtime"${suffix}`];
  const administrator = new Pool({ connectionString: database.url });
  const scratch = await createScratchDatabase(database);
  const url = new URL(scratch.db.url);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  let owner: Pool | undefined;
  try {
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} ALLOW_CONNECTIONS false`,
    );
    for (const login of logins) {
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
      );
      await administrator.query(
        `GRANT studio_app, studio_maintenance TO ${escapeIdentifier(login)} WITH SET TRUE, INHERIT FALSE`,
      );
    }
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} OWNER TO ${escapeIdentifier(logins[0])}`,
    );
    await administrator.query(`REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM PUBLIC, studio_app, studio_maintenance;
      GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${logins.map(escapeIdentifier).join(', ')}`);
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} ALLOW_CONNECTIONS true`,
    );
    url.username = logins[0];
    url.password = password;
    owner = new Pool({ connectionString: url.href });
    await run({
      administrator: scratch.pool,
      owner,
      url,
      logins,
      databaseName,
    });
  } finally {
    await owner?.end();
    await scratch.dispose();
    await administrator.query(
      `DROP ROLE IF EXISTS ${logins.map(escapeIdentifier).join(', ')}`,
    );
    await administrator.end();
  }
}

async function connectAs(
  url: URL,
  login: string,
  options: string | undefined,
  run: (pool: Pool) => Promise<void>,
) {
  const target = new URL(url);
  target.username = login;
  if (options) target.searchParams.set('options', options);
  const pool = new Pool({
    connectionString: target.href,
    connectionTimeoutMillis: 1500,
  });
  try {
    await run(pool);
  } finally {
    await pool.end();
  }
}

function nextMigration(
  previous: Migration,
  sql: string,
  sidecars = '',
): Migration {
  const ordinal = Number(previous.manifest.id.slice(0, 4)) + 1;
  const snapshot = { securityFixture: ordinal };
  const manifest = {
    format: 1 as const,
    id: `${String(ordinal).padStart(4, '0')}_security_fixture`,
    previous: previous.manifest.id,
    fingerprint: sha256(sql + sidecars),
    snapshotHash: jsonHash(snapshot),
    sqlHash: sha256(sql),
    sidecarsHash: sha256(sidecars),
  };
  return { manifest, snapshot, sql, sidecars, checksum: jsonHash(manifest) };
}

describe.skipIf(!database)('migration security invariants', () => {
  it('administrator provisioning removes direct and PUBLIC large-object capabilities without granting another identity access', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      const roles = ['studio_app', 'studio_maintenance', logins[1]];
      // Seed this test's initial ACL independently of the helper under test.
      await administrator.query(`REVOKE EXECUTE ON FUNCTION
        pg_catalog.lo_create(oid), pg_catalog.lo_creat(integer),
        pg_catalog.lo_from_bytea(oid,bytea), pg_catalog.lo_import(text),
        pg_catalog.lo_import(text,oid), pg_catalog.lo_export(oid,text) FROM PUBLIC`);
      const capabilities = `SELECT role.rolname, routine.signature,
        has_function_privilege(role.oid, routine.signature, 'EXECUTE') AS executable
        FROM pg_roles role CROSS JOIN (VALUES
          ('pg_catalog.lo_create(oid)'), ('pg_catalog.lo_creat(integer)'),
          ('pg_catalog.lo_from_bytea(oid,bytea)'), ('pg_catalog.lo_import(text)'),
          ('pg_catalog.lo_import(text,oid)'), ('pg_catalog.lo_export(oid,text)')
        ) routine(signature) WHERE role.rolname = ANY($1::text[]) ORDER BY role.rolname, routine.signature`;
      await administrator.query(`GRANT EXECUTE ON FUNCTION pg_catalog.lo_create(oid) TO PUBLIC;
        GRANT EXECUTE ON FUNCTION pg_catalog.lo_creat(integer) TO ${roles.map(escapeIdentifier).join(', ')};
        GRANT EXECUTE ON FUNCTION pg_catalog.lo_from_bytea(oid,bytea), pg_catalog.lo_import(text), pg_catalog.lo_import(text,oid), pg_catalog.lo_export(oid,text) TO ${escapeIdentifier(logins[1])}`);
      const before = (
        await administrator.query<{ executable: boolean }>(capabilities, [
          roles,
        ])
      ).rows;
      expect(before).toHaveLength(18);
      expect(before.filter(({ executable }) => executable)).toHaveLength(10);
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).rejects.toThrow('large-object creation');
      // A database owner is not implicitly the built-in function owner. Its
      // best-effort REVOKE must not be mistaken for administrator provisioning.
      await expect(
        owner.query(revokeLargeObjectPrivilegesSql(roles)),
      ).rejects.toMatchObject({ code: '42501' });
      expect((await administrator.query(capabilities, [roles])).rows).toEqual(
        before,
      );
      await administrator.query(revokeLargeObjectPrivilegesSql(roles));
      const after = (
        await administrator.query<{ executable: boolean }>(capabilities, [
          [...roles, logins[0]],
        ])
      ).rows;
      expect(after).toHaveLength(24);
      expect(after.every(({ executable }) => !executable)).toBe(true);
      expect(
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).toEqual(shipped.map((migration) => migration.manifest.id));
    });
  });

  it.each(['studio_app', 'studio_maintenance'])(
    'rejects owner-backed rewrite evidence forgery by %s',
    async (role) => {
      await withDeployment(async ({ administrator, owner, url, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const next = nextMigration(
          shipped.at(-1)!,
          'CREATE TABLE required_rule_migration (id integer PRIMARY KEY)',
        );
        await owner.query(`CREATE TABLE rewrite_source (id integer);
          GRANT INSERT ON rewrite_source TO ${escapeIdentifier(role)};
          CREATE RULE forge_evidence AS ON INSERT TO rewrite_source DO ALSO (
            INSERT INTO studio_migrations.history (position, id, checksum, fingerprint)
              VALUES (${shipped.length + 1}, '${next.manifest.id}', '${next.checksum}', '${next.manifest.fingerprint}');
            UPDATE public."schemaFingerprint" SET fingerprint = '${next.manifest.fingerprint}'
          )`);
        expect(
          (
            await administrator.query(
              `SELECT
          has_table_privilege($1, 'studio_migrations.history', 'INSERT') AS history_write,
          has_table_privilege($1, 'public."schemaFingerprint"', 'UPDATE') AS stamp_write`,
              [role],
            )
          ).rows,
        ).toEqual([{ history_write: false, stamp_write: false }]);
        await connectAs(url, logins[1], `-c role=${role}`, async (runtime) => {
          expect(
            (await runtime.query('INSERT INTO rewrite_source VALUES (1)'))
              .rowCount,
          ).toBe(1);
        });
        const forged = (
          await administrator.query(
            'SELECT * FROM studio_migrations.history ORDER BY position',
          )
        ).rows;
        expect(forged).toHaveLength(shipped.length + 1);
        expect(forged.at(-1)).toMatchObject({
          checksum: next.checksum,
          fingerprint: next.manifest.fingerprint,
        });
        await expect(
          migrateDatabase(
            owner,
            [...shipped, next],
            next.manifest.fingerprint,
            logins,
          ),
        ).rejects.toThrow('rewrite rules');
        expect(
          (
            await administrator.query(
              'SELECT * FROM studio_migrations.history ORDER BY position',
            )
          ).rows,
        ).toEqual(forged);
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('public.required_rule_migration') AS marker",
            )
          ).rows,
        ).toEqual([{ marker: null }]);
      });
    },
  );

  it.each([
    ['lo_compat_privileges', 'on', 'role'],
    ['lo_compat_privileges', 'on', 'database'],
    ['lo_compat_privileges', 'on', 'role in database'],
    ['session_replication_role', 'replica', 'role'],
    ['session_replication_role', 'replica', 'database'],
    ['session_replication_role', 'replica', 'role in database'],
  ] as const)(
    'rejects persisted %s=%s for %s despite revoked SET',
    async (parameter, value, scope) => {
      await withDeployment(
        async ({ administrator, owner, url, logins, databaseName }) => {
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
          const target =
            scope === 'database'
              ? `DATABASE ${escapeIdentifier(databaseName)}`
              : `ROLE ${escapeIdentifier(logins[1])}${scope === 'role in database' ? ` IN DATABASE ${escapeIdentifier(databaseName)}` : ''}`;
          await administrator.query(
            `ALTER ${target} SET ${parameter} = '${value}'`,
          );
          expect(
            (
              await owner.query(
                `SELECT current_setting($1) AS value, has_parameter_privilege($2, $1, 'SET') AS can_set`,
                [parameter, logins[1]],
              )
            ).rows,
          ).toEqual([
            {
              value: parameter === 'lo_compat_privileges' ? 'off' : 'origin',
              can_set: false,
            },
          ]);
          await connectAs(
            url,
            logins[1],
            '-c role=studio_app',
            async (runtime) => {
              expect(
                (
                  await runtime.query('SELECT current_setting($1) AS value', [
                    parameter,
                  ])
                ).rows,
              ).toEqual([{ value }]);
            },
          );
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).rejects.toThrow('persisted');
          await administrator.query(`ALTER ${target} RESET ${parameter}`);
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).toEqual([]);
        },
      );
    },
  );

  it.each([
    'studio_app',
    'studio_maintenance',
    BACKUP_ROLE,
    'enrolled login',
    'PUBLIC',
  ])(
    'rejects effective session_replication_role SET for %s',
    async (identity) => {
      await withDeployment(async ({ administrator, owner, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const client = await administrator.connect();
        try {
          await client.query('BEGIN');
          await client.query(runtimeRolesSql([BACKUP_ROLE]));
          const role =
            identity === 'enrolled login'
              ? logins[1]
              : identity === 'PUBLIC'
                ? 'studio_app'
                : identity;
          const grantee =
            identity === 'PUBLIC' ? 'PUBLIC' : escapeIdentifier(role);
          await client.query(
            `GRANT SET ON PARAMETER session_replication_role TO ${grantee}`,
          );
          await client.query(`SET LOCAL ROLE ${escapeIdentifier(role)}`);
          await client.query('SET LOCAL session_replication_role = replica');
          expect(
            (
              await client.query(
                "SELECT current_setting('session_replication_role') AS value",
              )
            ).rows,
          ).toEqual([{ value: 'replica' }]);
          await client.query('RESET ROLE');
          await client.query('SET LOCAL session_replication_role = origin');
          await client.query(
            `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(logins[0])}`,
          );
          await expect(
            enforceMigrationSecurity(client, logins),
          ).rejects.toThrow('session_replication_role');
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      });
    },
  );

  it('rejects a migration connection with disabled domain triggers after SET is revoked', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      const client = await administrator.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `GRANT SET ON PARAMETER session_replication_role TO ${escapeIdentifier(logins[0])}`,
        );
        await client.query(`SET LOCAL ROLE ${escapeIdentifier(logins[0])}`);
        await client.query('SET LOCAL session_replication_role = replica');
        await client.query('RESET ROLE');
        await client.query(
          `REVOKE SET ON PARAMETER session_replication_role FROM ${escapeIdentifier(logins[0])}`,
        );
        await client.query(
          `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(logins[0])}`,
        );
        expect(
          (
            await client.query(`SELECT current_setting('session_replication_role') AS value,
          has_parameter_privilege(current_user, 'session_replication_role', 'SET') AS can_set`)
          ).rows,
        ).toEqual([{ value: 'replica', can_set: false }]);
        await expect(enforceMigrationSecurity(client, logins)).rejects.toThrow(
          'session_replication_role',
        );
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });

  it.each([
    ['lo_create(oid)', 'lo_create(0)'],
    ['lo_creat(integer)', 'lo_creat(-1)'],
    [
      'lo_from_bytea(oid,bytea)',
      "lo_from_bytea(0, convert_to('unreviewed persistent write', 'UTF8'))",
    ],
  ] as const)(
    'rejects PUBLIC %s creation with an empty large-object inventory',
    async (signature, call) => {
      await withDeployment(async ({ administrator, owner, url, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await administrator.query(
          `GRANT EXECUTE ON FUNCTION pg_catalog.${signature} TO PUBLIC`,
        );
        await connectAs(
          url,
          logins[1],
          '-c role=studio_app',
          async (runtime) => {
            const client = await runtime.connect();
            try {
              await client.query('BEGIN');
              const object = (
                await client.query<{ oid: number }>(
                  `SELECT pg_catalog.${call} AS oid`,
                )
              ).rows[0]!;
              expect(object.oid).toBeGreaterThan(0);
              expect(
                (
                  await client.query(
                    `SELECT has_largeobject_privilege(current_user, $1, 'UPDATE') AS writable`,
                    [object.oid],
                  )
                ).rows,
              ).toEqual([{ writable: true }]);
            } finally {
              await client.query('ROLLBACK');
              client.release();
            }
          },
        );
        expect(
          (
            await administrator.query(
              'SELECT count(*)::int AS count FROM pg_largeobject_metadata',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('large-object creation');
        await administrator.query(
          `REVOKE EXECUTE ON FUNCTION pg_catalog.${signature} FROM PUBLIC`,
        );
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
        await connectAs(
          url,
          logins[1],
          '-c role=studio_app',
          async (runtime) => {
            await expect(
              runtime.query(`SELECT pg_catalog.${call}`),
            ).rejects.toMatchObject({ code: '42501' });
          },
        );
      });
    },
  );

  it.each([
    'studio_app',
    'studio_maintenance',
    'studio_app, studio_maintenance',
  ])(
    'requires complete runtime memberships when %s is missing',
    async (missing) => {
      await withDeployment(async ({ administrator, owner, url, logins }) => {
        await administrator.query(
          `REVOKE ${missing} FROM ${escapeIdentifier(logins[1])}`,
        );
        await connectAs(url, logins[1], undefined, async (runtime) => {
          const absent = missing.split(', ')[0]!;
          await expect(
            runtime.query(`SET ROLE ${escapeIdentifier(absent)}`),
          ).rejects.toMatchObject({ code: '42501' });
        });
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('memberships');
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
        await administrator.query(
          `GRANT studio_app, studio_maintenance TO ${escapeIdentifier(logins[1])} WITH INHERIT FALSE, SET TRUE`,
        );
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual(shipped.map((migration) => migration.manifest.id));
      });
    },
  );

  it.each(['studio_app', 'studio_maintenance'])(
    'rejects %s TRUNCATE that bypasses row-level security',
    async (role) => {
      await withDeployment(async ({ administrator, owner, url, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await owner.query(`CREATE TABLE truncate_target (id integer PRIMARY KEY);
          INSERT INTO truncate_target VALUES (1), (2);
          ALTER TABLE truncate_target ENABLE ROW LEVEL SECURITY;
          ALTER TABLE truncate_target FORCE ROW LEVEL SECURITY;
          CREATE POLICY empty_visibility ON truncate_target USING (false);
          GRANT SELECT, TRUNCATE ON truncate_target TO ${escapeIdentifier(role)}`);
        await connectAs(url, logins[1], `-c role=${role}`, async (runtime) => {
          expect(
            (await runtime.query('SELECT * FROM truncate_target')).rows,
          ).toEqual([]);
          await runtime.query('TRUNCATE truncate_target');
        });
        // The unrestricted observer proves real deletion; the runtime's empty
        // RLS result alone would have been a vacuous truncation oracle.
        expect(
          (
            await administrator.query(
              'SELECT count(*)::int AS count FROM truncate_target',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('reviewed Studio roles');
        await owner.query(
          `REVOKE TRUNCATE ON truncate_target FROM ${escapeIdentifier(role)}`,
        );
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      });
    },
  );
  it.each([
    ['studio_app', 'direct'],
    ['studio_app', 'cascade'],
    ['studio_app', 'disabled'],
    ['studio_maintenance', 'direct'],
    ['studio_maintenance', 'cascade'],
    ['studio_maintenance', 'disabled'],
  ] as const)(
    'refuses evidence forged through a %s definer trigger (%s) before trusting history',
    async (role, path) => {
      await withDeployment(async ({ administrator, owner, url, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const next = nextMigration(
          shipped.at(-1)!,
          'CREATE TABLE required_trigger_migration (id integer PRIMARY KEY)',
        );
        await owner.query(`CREATE TABLE trigger_source (id integer PRIMARY KEY, sibling integer);
          INSERT INTO trigger_source VALUES (1, 0);
          CREATE TABLE trigger_child (id integer PRIMARY KEY, source_id integer REFERENCES trigger_source(id) ON DELETE CASCADE);
          INSERT INTO trigger_child VALUES (1, 1);
          CREATE FUNCTION trigger_forge_evidence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
          BEGIN
            INSERT INTO studio_migrations.history (position, id, checksum, fingerprint)
              VALUES (${shipped.length + 1}, '${next.manifest.id}', '${next.checksum}', '${next.manifest.fingerprint}');
            UPDATE public."schemaFingerprint" SET fingerprint = '${next.manifest.fingerprint}';
            RETURN NULL;
          END
          $function$;
          REVOKE ALL ON FUNCTION trigger_forge_evidence() FROM PUBLIC, studio_app, studio_maintenance`);
        const target = path === 'cascade' ? 'trigger_child' : 'trigger_source';
        const event = path === 'cascade' ? 'DELETE' : 'UPDATE OF sibling';
        await owner.query(`CREATE TRIGGER forge_evidence AFTER ${event} ON ${target}
          FOR EACH ROW EXECUTE FUNCTION trigger_forge_evidence()`);
        await owner.query(
          path === 'cascade'
            ? `GRANT DELETE ON trigger_source TO ${escapeIdentifier(role)}`
            : `GRANT UPDATE (sibling) ON trigger_source TO ${escapeIdentifier(role)}`,
        );
        const attack =
          path === 'cascade'
            ? 'DELETE FROM trigger_source'
            : 'UPDATE trigger_source SET sibling = 1';
        expect(
          (
            await administrator.query(
              `SELECT
          has_function_privilege($1, 'trigger_forge_evidence()', 'EXECUTE') AS executable,
          has_table_privilege($1, 'studio_migrations.history', 'INSERT') AS history_writable,
          has_table_privilege($1, 'public."schemaFingerprint"', 'UPDATE') AS fingerprint_writable,
          has_table_privilege($1, 'trigger_child', 'DELETE') AS child_writable`,
              [role],
            )
          ).rows,
        ).toEqual([
          {
            executable: false,
            history_writable: false,
            fingerprint_writable: false,
            child_writable: false,
          },
        ]);
        await connectAs(url, logins[1], `-c role=${role}`, async (runtime) => {
          expect(
            (await runtime.query('SELECT current_user AS role')).rows,
          ).toEqual([{ role }]);
          expect((await runtime.query(attack)).rowCount).toBe(1);
        });
        const forged = (
          await administrator.query(
            'SELECT * FROM studio_migrations.history ORDER BY position',
          )
        ).rows;
        expect(forged).toHaveLength(shipped.length + 1);
        expect(forged.at(-1)).toMatchObject({
          checksum: next.checksum,
          fingerprint: next.manifest.fingerprint,
        });
        expect(
          (
            await administrator.query(
              'SELECT fingerprint FROM public."schemaFingerprint"',
            )
          ).rows,
        ).toEqual([{ fingerprint: next.manifest.fingerprint }]);
        if (path === 'disabled') {
          await owner.query(
            'ALTER TABLE trigger_source DISABLE TRIGGER forge_evidence',
          );
          expect(
            (
              await owner.query(
                "SELECT tgenabled FROM pg_trigger WHERE tgname = 'forge_evidence'",
              )
            ).rows,
          ).toEqual([{ tgenabled: 'D' }]);
        }
        await expect(
          migrateDatabase(
            owner,
            [...shipped, next],
            next.manifest.fingerprint,
            logins,
          ),
        ).rejects.toThrow('SECURITY DEFINER trigger');
        expect(
          (
            await administrator.query(
              'SELECT * FROM studio_migrations.history ORDER BY position',
            )
          ).rows,
        ).toEqual(forged);
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('public.required_trigger_migration') AS marker",
            )
          ).rows,
        ).toEqual([{ marker: null }]);
      });
    },
  );

  it('allows invoker triggers and standalone non-executable definer routines', async () => {
    await withDeployment(async ({ owner, url, logins }) => {
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      await owner.query(`CREATE TABLE ordinary_trigger_source (id integer PRIMARY KEY, sibling integer);
        CREATE FUNCTION ordinary_trigger() RETURNS trigger LANGUAGE plpgsql AS $function$
          BEGIN NEW.sibling = NEW.id * 2; RETURN NEW; END
        $function$;
        REVOKE ALL ON FUNCTION ordinary_trigger() FROM PUBLIC, studio_app, studio_maintenance;
        CREATE TRIGGER ordinary BEFORE INSERT ON ordinary_trigger_source FOR EACH ROW EXECUTE FUNCTION ordinary_trigger();
        GRANT INSERT, SELECT ON ordinary_trigger_source TO studio_app;
        CREATE FUNCTION standalone_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER AS 'SELECT 42';
        REVOKE ALL ON FUNCTION standalone_definer() FROM PUBLIC, studio_app, studio_maintenance`);
      expect(
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).toEqual([]);
      await connectAs(url, logins[1], '-c role=studio_app', async (runtime) => {
        expect(
          (
            await runtime.query(
              'INSERT INTO ordinary_trigger_source (id) VALUES (7) RETURNING sibling',
            )
          ).rows,
        ).toEqual([{ sibling: 14 }]);
        await expect(
          runtime.query('SELECT standalone_definer()'),
        ).rejects.toMatchObject({ code: '42501' });
      });
    });
  });

  it.each([
    ['studio_app', false],
    ['studio_app', true],
    ['studio_maintenance', false],
    ['studio_maintenance', true],
    [BACKUP_ROLE, false],
    [BACKUP_ROLE, true],
    ['enrolled login', false],
    ['enrolled login', true],
    ['PUBLIC', false],
    ['PUBLIC', true],
  ] as const)(
    'refuses effective large-object compatibility SET for %s with existing object %s',
    async (identity, existingObject) => {
      await withDeployment(async ({ administrator, owner, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const history = (
          await administrator.query('SELECT * FROM studio_migrations.history')
        ).rows;
        expect(history).toHaveLength(shipped.length);
        expect(
          (
            await administrator.query(
              'SELECT count(*)::int AS count FROM pg_largeobject_metadata',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        const client = await administrator.connect();
        try {
          await client.query('BEGIN');
          await client.query(runtimeRolesSql([BACKUP_ROLE]));
          const role =
            identity === 'enrolled login'
              ? logins[1]
              : identity === 'PUBLIC'
                ? 'studio_app'
                : identity;
          const grantee =
            identity === 'PUBLIC' ? 'PUBLIC' : escapeIdentifier(role);
          await client.query(
            `GRANT SET ON PARAMETER lo_compat_privileges TO ${grantee}`,
          );
          if (existingObject) {
            const object = (
              await client.query<{ oid: number }>(
                "SELECT lo_from_bytea(0, convert_to('original', 'UTF8')) AS oid",
              )
            ).rows[0]!;
            expect(object.oid).toBeGreaterThan(0);
            await client.query(`SET LOCAL ROLE ${escapeIdentifier(role)}`);
            expect(
              (
                await client.query(
                  `SELECT current_user AS role,
              has_parameter_privilege(current_user, 'lo_compat_privileges', 'SET') AS can_set,
              has_largeobject_privilege(current_user, $1, 'SELECT,UPDATE') AS object_access`,
                  [object.oid],
                )
              ).rows,
            ).toEqual([{ role, can_set: true, object_access: false }]);
            await client.query('SAVEPOINT normal_permissions');
            await expect(
              client.query(
                "SELECT lo_put($1, 0, convert_to('modified', 'UTF8'))",
                [object.oid],
              ),
            ).rejects.toMatchObject({ code: '42501' });
            await client.query('ROLLBACK TO SAVEPOINT normal_permissions');
            await client.query('SET LOCAL lo_compat_privileges = on');
            await client.query(
              "SELECT lo_put($1, 0, convert_to('modified', 'UTF8'))",
              [object.oid],
            );
            await client.query('RESET ROLE');
            expect(
              (
                await client.query(
                  "SELECT convert_from(lo_get($1), 'UTF8') AS content",
                  [object.oid],
                )
              ).rows,
            ).toEqual([{ content: 'modified' }]);
          }
          // Separate the effective SET capability from the current-setting
          // guard. Both the grant and its proof are transaction-local fixtures.
          await client.query('SET LOCAL lo_compat_privileges = off');
          await client.query(
            `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(logins[0])}`,
          );
          expect(
            (
              await client.query(
                'SELECT session_user AS login, current_user AS role',
              )
            ).rows,
          ).toEqual([{ login: logins[0], role: logins[0] }]);
          await expect(
            enforceMigrationSecurity(client, logins),
          ).rejects.toThrow('lo_compat_privileges');
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
        expect(
          (await administrator.query('SELECT * FROM studio_migrations.history'))
            .rows,
        ).toEqual(history);
        expect(
          (
            await administrator.query(
              'SELECT count(*)::int AS count FROM pg_largeobject_metadata',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      });
    },
  );

  it('refuses a connection left in large-object compatibility mode after SET is revoked', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      const client = await administrator.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `GRANT SET ON PARAMETER lo_compat_privileges TO ${escapeIdentifier(logins[0])}`,
        );
        await client.query(`SET LOCAL ROLE ${escapeIdentifier(logins[0])}`);
        await client.query('SET LOCAL lo_compat_privileges = on');
        await client.query('RESET ROLE');
        await client.query(
          `REVOKE SET ON PARAMETER lo_compat_privileges FROM ${escapeIdentifier(logins[0])}`,
        );
        await client.query(
          `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(logins[0])}`,
        );
        expect(
          (
            await client.query(`SELECT current_setting('lo_compat_privileges') AS compatibility,
          has_parameter_privilege(current_user, 'lo_compat_privileges', 'SET') AS can_set`)
          ).rows,
        ).toEqual([{ compatibility: 'on', can_set: false }]);
        expect(
          (
            await client.query(
              'SELECT count(*)::int AS count FROM pg_largeobject_metadata',
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
        await expect(enforceMigrationSecurity(client, logins)).rejects.toThrow(
          'lo_compat_privileges',
        );
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      expect(
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).toEqual([]);
    });
  });

  it.each(['studio_app', 'studio_maintenance', BACKUP_ROLE])(
    'refuses valid-looking migration evidence forged by %s before skipping required SQL',
    async (role) => {
      await withDeployment(async ({ administrator, owner, logins }) => {
        await administrator.query('BEGIN');
        await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
        await administrator.query('COMMIT');
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const next = nextMigration(
          shipped.at(-1)!,
          'CREATE TABLE required_migration_marker (id integer PRIMARY KEY)',
        );
        await administrator.query(`GRANT USAGE ON SCHEMA studio_migrations, public TO ${escapeIdentifier(role)};
          GRANT INSERT ON studio_migrations.history TO ${escapeIdentifier(role)};
          GRANT UPDATE (fingerprint) ON public."schemaFingerprint" TO ${escapeIdentifier(role)}`);
        const attacker = await administrator.connect();
        try {
          await attacker.query('BEGIN');
          await attacker.query(`SET LOCAL ROLE ${escapeIdentifier(role)}`);
          expect(
            (await attacker.query('SELECT current_user AS role')).rows,
          ).toEqual([{ role }]);
          expect(
            (
              await attacker.query(
                'INSERT INTO studio_migrations.history (position, id, checksum, fingerprint) VALUES ($1, $2, $3, $4)',
                [
                  shipped.length + 1,
                  next.manifest.id,
                  next.checksum,
                  next.manifest.fingerprint,
                ],
              )
            ).rowCount,
          ).toBe(1);
          expect(
            (
              await attacker.query(
                'UPDATE public."schemaFingerprint" SET fingerprint = $1',
                [next.manifest.fingerprint],
              )
            ).rowCount,
          ).toBe(1);
          await attacker.query('COMMIT');
        } finally {
          await attacker.query('ROLLBACK');
          attacker.release();
        }
        const forged = (
          await administrator.query(
            'SELECT * FROM studio_migrations.history ORDER BY position',
          )
        ).rows;
        expect(forged).toHaveLength(shipped.length + 1);
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('public.required_migration_marker') AS marker",
            )
          ).rows,
        ).toEqual([{ marker: null }]);
        await expect(
          migrateDatabase(
            owner,
            [...shipped, next],
            next.manifest.fingerprint,
            logins,
          ),
        ).rejects.toThrow('migration evidence is writable');
        expect(
          (
            await administrator.query(
              'SELECT * FROM studio_migrations.history ORDER BY position',
            )
          ).rows,
        ).toEqual(forged);
        expect(
          (
            await administrator.query(
              'SELECT fingerprint FROM public."schemaFingerprint"',
            )
          ).rows,
        ).toEqual([{ fingerprint: next.manifest.fingerprint }]);
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('public.required_migration_marker') AS marker",
            )
          ).rows,
        ).toEqual([{ marker: null }]);
        // Refusal must not revoke the unsafe grants and silently make forged
        // evidence look trustworthy to the next invocation.
        expect(
          (
            await administrator.query(
              "SELECT has_table_privilege($1, 'studio_migrations.history', 'INSERT') AS writable",
              [role],
            )
          ).rows,
        ).toEqual([{ writable: true }]);
      });
    },
  );

  it.each(['studio_migrations.history', 'public."schemaFingerprint"'])(
    'runs strict security preflight before reading %s',
    async (table) => {
      await withDeployment(async ({ administrator, owner, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await owner.query(`CREATE FUNCTION evidence_read_trap() RETURNS boolean LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''evidence read before preflight''; END';
          ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
          CREATE POLICY evidence_read_trap ON ${table} FOR SELECT USING (evidence_read_trap());
          GRANT UPDATE (fingerprint) ON public."schemaFingerprint" TO studio_app`);
        // This actual owner read proves the RLS trap is active. Catalog-only
        // preflight checks must reject the grant before reaching either read.
        await expect(owner.query(`SELECT * FROM ${table}`)).rejects.toThrow(
          'evidence read before preflight',
        );
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('migration evidence is writable');
        await administrator.query(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;
          REVOKE UPDATE ON public."schemaFingerprint" FROM studio_app`);
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      });
    },
  );

  it('contains historical evidence grants before the next migration SQL executes', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await administrator.query('BEGIN');
      await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
      await administrator.query('COMMIT');
      const first = shipped[0]!;
      const sidecars =
        first.sidecars +
        `\nGRANT USAGE ON SCHEMA studio_migrations TO ${BACKUP_ROLE};
        GRANT ALL ON studio_migrations.history, public."schemaFingerprint" TO ${BACKUP_ROLE};
        GRANT UPDATE (fingerprint) ON public."schemaFingerprint" TO PUBLIC;`;
      const manifest = { ...first.manifest, sidecarsHash: sha256(sidecars) };
      const initial = {
        ...first,
        sidecars,
        manifest,
        checksum: jsonHash(manifest),
      };
      const next = nextMigration(
        initial,
        `CREATE TABLE per_migration_guard (protected boolean NOT NULL CHECK (protected));
        INSERT INTO per_migration_guard SELECT NOT (
          has_any_column_privilege('studio_app', 'public."schemaFingerprint"', 'UPDATE')
          OR has_any_column_privilege('${BACKUP_ROLE}', 'studio_migrations.history', 'INSERT,UPDATE')
          OR has_any_column_privilege('${BACKUP_ROLE}', 'public."schemaFingerprint"', 'UPDATE')
        );`,
      );
      expect(
        await migrateDatabase(
          owner,
          [initial, next],
          next.manifest.fingerprint,
          logins,
        ),
      ).toEqual([initial.manifest.id, next.manifest.id]);
      expect(
        (await owner.query('SELECT * FROM per_migration_guard')).rows,
      ).toEqual([{ protected: true }]);
      expect(
        (
          await owner.query(
            'SELECT id FROM studio_migrations.history ORDER BY position',
          )
        ).rows,
      ).toEqual([{ id: initial.manifest.id }, { id: next.manifest.id }]);
    });
  });

  it.each(['studio_app', 'studio_maintenance', BACKUP_ROLE, 'enrolled login'])(
    'refuses large-object writes by %s while preserving reviewed backup reads',
    async (identity) => {
      await withDeployment(async ({ administrator, owner, logins }) => {
        await administrator.query('BEGIN');
        await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
        await administrator.query('COMMIT');
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const role = identity === 'enrolled login' ? logins[1] : identity;
        const object = (
          await administrator.query<{ oid: number }>(
            "SELECT lo_from_bytea(0, convert_to('original', 'UTF8')) AS oid",
          )
        ).rows[0]!;
        expect(object.oid).toBeGreaterThan(0);
        const history = (
          await administrator.query('SELECT * FROM studio_migrations.history')
        ).rows;
        expect(history).toHaveLength(shipped.length);
        await administrator.query(
          `GRANT SELECT ON LARGE OBJECT ${object.oid} TO ${escapeIdentifier(role)}`,
        );
        const reader = await administrator.connect();
        try {
          await reader.query('BEGIN');
          await reader.query(`SET LOCAL ROLE ${escapeIdentifier(role)}`);
          expect(
            (
              await reader.query(
                "SELECT convert_from(lo_get($1), 'UTF8') AS content",
                [object.oid],
              )
            ).rows,
          ).toEqual([{ content: 'original' }]);
        } finally {
          await reader.query('ROLLBACK');
          reader.release();
        }
        if (role === BACKUP_ROLE) {
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).toEqual([]);
        }
        await administrator.query(
          `GRANT UPDATE ON LARGE OBJECT ${object.oid} TO ${escapeIdentifier(role)}`,
        );
        const attacker = await administrator.connect();
        try {
          await attacker.query('BEGIN');
          await attacker.query(`SET LOCAL ROLE ${escapeIdentifier(role)}`);
          expect(
            (await attacker.query('SELECT current_user AS role')).rows,
          ).toEqual([{ role }]);
          await attacker.query(
            "SELECT lo_put($1, 0, convert_to('modified', 'UTF8'))",
            [object.oid],
          );
          // Observe the uncommitted write before rolling the proof back.
          await attacker.query('RESET ROLE');
          expect(
            (
              await attacker.query(
                "SELECT convert_from(lo_get($1), 'UTF8') AS content",
                [object.oid],
              )
            ).rows,
          ).toEqual([{ content: 'modified' }]);
        } finally {
          await attacker.query('ROLLBACK');
          attacker.release();
        }
        if (role !== BACKUP_ROLE) {
          // Isolate the UPDATE scan after the actual read/write proof, so the
          // separate prohibition on runtime SELECT cannot mask a missing guard.
          await administrator.query(
            `REVOKE SELECT ON LARGE OBJECT ${object.oid} FROM ${escapeIdentifier(role)}`,
          );
        }
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('large object');
        expect(
          (await administrator.query('SELECT * FROM studio_migrations.history'))
            .rows,
        ).toEqual(history);
        expect(
          (
            await administrator.query(
              "SELECT convert_from(lo_get($1), 'UTF8') AS content",
              [object.oid],
            )
          ).rows,
        ).toEqual([{ content: 'original' }]);
        await administrator.query(
          `REVOKE UPDATE ON LARGE OBJECT ${object.oid} FROM ${escapeIdentifier(role)}`,
        );
        if (role !== BACKUP_ROLE) {
          await administrator.query(
            `GRANT SELECT ON LARGE OBJECT ${object.oid} TO ${escapeIdentifier(role)}`,
          );
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).rejects.toThrow('large object');
          await administrator.query(
            `REVOKE SELECT ON LARGE OBJECT ${object.oid} FROM ${escapeIdentifier(role)}`,
          );
        }
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
        await administrator.query(
          `ALTER LARGE OBJECT ${object.oid} OWNER TO ${escapeIdentifier(role)}`,
        );
        // Large-object ownership appears in the same pg_shdepend ownership
        // scan as ordinary objects; no parallel owner check is needed.
        expect(
          (
            await administrator.query(
              `SELECT EXISTS (
                SELECT 1 FROM pg_shdepend dependency
                WHERE dependency.refclassid = 'pg_authid'::regclass
                  AND dependency.refobjid = (SELECT oid FROM pg_roles WHERE rolname = $2)
                  AND dependency.classid IN ('pg_largeobject'::regclass, 'pg_largeobject_metadata'::regclass)
                  AND dependency.objid = $1 AND dependency.deptype = 'o'
                  AND dependency.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
              ) AS owned`,
              [object.oid, role],
            )
          ).rows,
        ).toEqual([{ owned: true }]);
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('own no database objects');
      });
    },
  );

  it('keeps fingerprint evidence readable but refuses every runtime write, including after a no-op migration', async () => {
    await withDeployment(async ({ administrator, owner, url, logins }) => {
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      const before = (
        await administrator.query('SELECT * FROM public."schemaFingerprint"')
      ).rows;
      expect(
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).toEqual([]);
      for (const role of ['studio_app', 'studio_maintenance']) {
        await connectAs(url, logins[1], `-c role=${role}`, async (pool) => {
          expect(
            (await pool.query('SELECT * FROM public."schemaFingerprint"')).rows,
          ).toEqual(before);
          for (const sql of [
            'UPDATE public."schemaFingerprint" SET fingerprint = \'forged\'',
            'DELETE FROM public."schemaFingerprint"',
            'TRUNCATE public."schemaFingerprint"',
            'INSERT INTO public."schemaFingerprint" (fingerprint) VALUES (\'forged\')',
          ]) {
            await expect(pool.query(sql)).rejects.toMatchObject({
              code: '42501',
            });
          }
        });
      }
      expect(
        (await administrator.query('SELECT * FROM public."schemaFingerprint"'))
          .rows,
      ).toEqual(before);
    });
  });

  it('refuses cross-deployment connections from both owner and runtime logins, even with hostile startup roles', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        await migrateDatabase(
          first.owner,
          shipped,
          SCHEMA_FINGERPRINT,
          first.logins,
        );
        await migrateDatabase(
          second.owner,
          shipped,
          SCHEMA_FINGERPRINT,
          second.logins,
        );
        for (const deployment of [first, second]) {
          for (const login of deployment.logins) {
            await connectAs(
              deployment.url,
              login,
              '-c role=studio_app',
              async (pool) => {
                expect(
                  (
                    await pool.query(
                      'SELECT count(*)::int AS count FROM public."user"',
                    )
                  ).rows,
                ).toEqual([{ count: 0 }]);
              },
            );
          }
        }
        for (const [source, target] of [
          [first, second],
          [second, first],
        ] as const) {
          for (const login of source.logins) {
            for (const role of [
              undefined,
              'studio_app',
              'studio_maintenance',
              target.logins[0],
            ]) {
              await connectAs(
                target.url,
                login,
                role ? `-c role=${role}` : undefined,
                async (pool) => {
                  await expect(
                    pool.query('SELECT * FROM public."user"'),
                  ).rejects.toMatchObject({ code: '42501' });
                },
              );
            }
          }
        }
      });
    });
  });

  it.each([false, true])(
    'refuses a retained outside connection after CONNECT revocation (already migrated=%s)',
    async (alreadyMigrated) => {
      await withDeployment(async (first) => {
        await withDeployment(async (second) => {
          if (alreadyMigrated)
            await migrateDatabase(
              second.owner,
              shipped,
              SCHEMA_FINGERPRINT,
              second.logins,
            );
          const before = (
            await second.administrator.query(
              "SELECT to_regclass('public.teams')::text AS table",
            )
          ).rows;
          // Reproduce an older publicly connectable database, then commit the
          // corrected ACL while retaining an already authenticated outside session.
          await second.administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} TO PUBLIC`,
          );
          await connectAs(
            second.url,
            first.logins[1],
            '-c role=studio_app',
            async (outside) => {
              expect(
                (await outside.query('SELECT 1 AS connected')).rows,
              ).toEqual([{ connected: 1 }]);
              await second.administrator.query(
                `REVOKE CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} FROM PUBLIC`,
              );
              expect(
                (
                  await second.administrator.query(
                    "SELECT has_database_privilege($1, current_database(), 'CONNECT') AS allowed",
                    [first.logins[1]],
                  )
                ).rows,
              ).toEqual([{ allowed: false }]);
              await expect(
                migrateDatabase(
                  second.owner,
                  shipped,
                  SCHEMA_FINGERPRINT,
                  second.logins,
                ),
              ).rejects.toThrow('connections');
              expect(
                (
                  await second.administrator.query(
                    "SELECT to_regclass('public.teams')::text AS table",
                  )
                ).rows,
              ).toEqual(before);
            },
          );
          await migrateDatabase(
            second.owner,
            shipped,
            SCHEMA_FINGERPRINT,
            second.logins,
          );
        });
      });
    },
  );

  it.each(['studio_app', 'studio_maintenance'])(
    'refuses runtime sequence UPDATE for %s while preserving USAGE and SELECT',
    async (role) => {
      await withDeployment(async ({ owner, url, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await owner.query(`CREATE SEQUENCE runtime_sequence MAXVALUE 9;
          GRANT USAGE, SELECT ON SEQUENCE runtime_sequence TO ${escapeIdentifier(role)}`);
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).resolves.toEqual([]);
        await connectAs(url, logins[1], `-c role=${role}`, async (runtime) => {
          expect(
            (await runtime.query("SELECT nextval('runtime_sequence') AS value"))
              .rows,
          ).toEqual([{ value: '1' }]);
          await expect(
            runtime.query("SELECT setval('runtime_sequence', 9, true)"),
          ).rejects.toMatchObject({ code: '42501' });
          await owner.query(
            `GRANT UPDATE ON SEQUENCE runtime_sequence TO ${escapeIdentifier(role)}`,
          );
          expect(
            (
              await runtime.query(
                "SELECT setval('runtime_sequence', 9, true) AS value",
              )
            ).rows,
          ).toEqual([{ value: '9' }]);
          await expect(
            runtime.query("SELECT nextval('runtime_sequence')"),
          ).rejects.toMatchObject({ code: '2200H' });
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).rejects.toThrow('sequence');
        });
      });
    },
  );

  it.each([undefined, 'studio_app', 'studio_maintenance'])(
    'refuses pending migrations with an enrolled runtime session using role %s',
    async (role) => {
      await withDeployment(async ({ owner, url, logins }) => {
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await owner.query('CREATE SEQUENCE public.runtime_execution_probe');
        const next = nextMigration(
          shipped.at(-1)!,
          "SELECT nextval('public.runtime_execution_probe'); CREATE TABLE public.pending_runtime_guard (id integer)",
        );
        await connectAs(
          url,
          logins[1],
          role ? `-c role=${role}` : undefined,
          async (runtime) => {
            await runtime.query('SELECT 1');
            // A no-op security verification remains available with live services.
            await expect(
              migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
            ).resolves.toEqual([]);
            await expect(
              migrateDatabase(
                owner,
                [...shipped, next],
                next.manifest.fingerprint,
                logins,
              ),
            ).rejects.toThrow('runtime connections');
            expect(
              (
                await owner.query(
                  "SELECT to_regclass('pending_runtime_guard') AS table",
                )
              ).rows,
            ).toEqual([{ table: null }]);
            expect(
              (
                await owner.query(
                  'SELECT fingerprint FROM public."schemaFingerprint"',
                )
              ).rows,
            ).toEqual([{ fingerprint: SCHEMA_FINGERPRINT }]);
            // Sequence allocation survives rollback: a final-only refusal must
            // not masquerade as refusing to begin pending SQL.
            expect(
              (
                await owner.query(
                  'SELECT is_called FROM public.runtime_execution_probe',
                )
              ).rows,
            ).toEqual([{ is_called: false }]);
          },
        );
        await expect(
          migrateDatabase(
            owner,
            [...shipped, next],
            next.manifest.fingerprint,
            logins,
          ),
        ).resolves.toEqual([next.manifest.id]);
        expect(
          (
            await owner.query(
              'SELECT is_called FROM public.runtime_execution_probe',
            )
          ).rows,
        ).toEqual([{ is_called: true }]);
      });
    },
  );

  it('rolls back pending SQL when an enrolled runtime session arrives during migration', async () => {
    await withDeployment(async ({ administrator, owner, url, logins }) => {
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      const gate = Number.parseInt(randomUUID().slice(0, 7), 16);
      const blocker = await administrator.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('SELECT pg_advisory_lock($1)', [gate]);
        const next = nextMigration(
          shipped.at(-1)!,
          `CREATE TABLE racing_runtime_guard (id integer); SELECT pg_advisory_xact_lock(${gate})`,
        );
        pending = migrateDatabase(
          owner,
          [...shipped, next],
          next.manifest.fingerprint,
          logins,
        ).catch((error: unknown) => error);
        await expect
          .poll(
            async () =>
              (
                await administrator.query<{ waiting: boolean }>(
                  "SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 0 AND objid = $1 AND NOT granted) AS waiting",
                  [gate],
                )
              ).rows[0]?.waiting,
          )
          .toBe(true);
        await connectAs(
          url,
          logins[1],
          '-c role=studio_app',
          async (runtime) => {
            await runtime.query('SELECT 1');
            await blocker.query('SELECT pg_advisory_unlock($1)', [gate]);
            const outcome = await pending;
            expect(outcome).toBeInstanceOf(Error);
            expect(String(outcome)).toContain('runtime connections');
            expect(
              (
                await owner.query(
                  "SELECT to_regclass('racing_runtime_guard') AS table",
                )
              ).rows,
            ).toEqual([{ table: null }]);
            expect(
              (
                await owner.query(
                  'SELECT fingerprint FROM public."schemaFingerprint"',
                )
              ).rows,
            ).toEqual([{ fingerprint: SCHEMA_FINGERPRINT }]);
          },
        );
      } finally {
        await blocker.query('SELECT pg_advisory_unlock($1)', [gate]);
        blocker.release();
        await pending;
      }
    });
  });

  it('refreshes connection evidence between checks in the same transaction', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        const client = await second.owner.connect();
        try {
          await client.query('BEGIN');
          await enforceMigrationSecurity(client, second.logins);
          // An administrator temporarily reopening admission is a breach of
          // the provisioning contract. The final check must see the new
          // retained session, even though the first check cached pg_stat_activity.
          await second.administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} TO PUBLIC`,
          );
          await connectAs(
            second.url,
            first.logins[1],
            '-c role=studio_app',
            async (outside) => {
              await outside.query('SELECT 1');
              await second.administrator.query(
                `REVOKE CONNECT ON DATABASE ${escapeIdentifier(second.databaseName)} FROM PUBLIC`,
              );
              await expect(
                enforceMigrationSecurity(client, second.logins),
              ).rejects.toThrow('connections');
            },
          );
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      });
    });
  });

  it('rejects missing enrollment before executing any historical SQL', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        await administrator.query(
          `REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM ${escapeIdentifier(logins[1])}`,
        );
        const initial = shipped[0]!;
        const sql = 'SELECT 1/0;\n' + initial.sql;
        const manifest = { ...initial.manifest, sqlHash: sha256(sql) };
        const failing = {
          ...initial,
          manifest,
          checksum: jsonHash(manifest),
          sql,
        };
        // With preflight removed, the authored SQL raises division-by-zero;
        // a finalizer-only guard cannot produce this enrollment refusal.
        await expect(
          migrateDatabase(
            owner,
            [failing],
            initial.manifest.fingerprint,
            logins,
          ),
        ).rejects.toThrow('precommitted enrollment');
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
      },
    );
  });

  it('requires committed explicit CONNECT for each enrolled login and refuses PUBLIC admission', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        await administrator.query(
          `REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM ${escapeIdentifier(logins[1])}`,
        );
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('precommitted enrollment');
        await administrator.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(logins[1])}, PUBLIC`,
        );
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('precommitted enrollment');
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('public.teams') AS table",
            )
          ).rows,
        ).toEqual([{ table: null }]);
        await administrator.query(
          `REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM PUBLIC`,
        );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      },
    );
  });

  it('rejects unlisted explicit CONNECT grants before applying schema and rechecks enrollment on a no-op run', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        await first.administrator.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(first.databaseName)} TO ${escapeIdentifier(second.logins[1])}`,
        );
        try {
          await expect(
            migrateDatabase(
              first.owner,
              shipped,
              SCHEMA_FINGERPRINT,
              first.logins,
            ),
          ).rejects.toThrow('unenrolled');
          expect(
            (
              await first.administrator.query(
                "SELECT to_regclass('public.teams') AS table",
              )
            ).rows,
          ).toEqual([{ table: null }]);
          await first.administrator.query(
            `REVOKE CONNECT ON DATABASE ${escapeIdentifier(first.databaseName)} FROM ${escapeIdentifier(second.logins[1])}`,
          );
          await migrateDatabase(
            first.owner,
            shipped,
            SCHEMA_FINGERPRINT,
            first.logins,
          );
          await expect(
            migrateDatabase(first.owner, shipped, SCHEMA_FINGERPRINT, [
              first.logins[0],
            ]),
          ).rejects.toThrow('unenrolled');
        } finally {
          await first.administrator.query(
            `REVOKE CONNECT ON DATABASE ${escapeIdentifier(first.databaseName)} FROM ${escapeIdentifier(second.logins[1])}`,
          );
        }
      });
    });
  });

  it('rejects an outside member of an enrolled login even when inheritance is disabled', async () => {
    await withDeployment(async (first) => {
      await withDeployment(async (second) => {
        await first.administrator.query(
          `GRANT ${escapeIdentifier(first.logins[0])} TO ${escapeIdentifier(second.logins[0])} WITH SET TRUE, INHERIT FALSE`,
        );
        await expect(
          migrateDatabase(
            first.owner,
            shipped,
            SCHEMA_FINGERPRINT,
            first.logins,
          ),
        ).rejects.toThrow('memberships');
        expect(
          (
            await first.administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
      });
    });
  });

  it.each([
    'NOLOGIN',
    'SUPERUSER',
    'BYPASSRLS',
    'CREATEROLE',
    'CREATEDB',
    'REPLICATION',
    'INHERIT',
  ])('refuses an enrolled non-operator login with %s', async (attribute) => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await administrator.query(
        `ALTER ROLE ${escapeIdentifier(logins[1])} ${attribute}`,
      );
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).rejects.toThrow('Enrolled Studio identities');
      expect(
        (
          await administrator.query(
            "SELECT to_regclass('public.teams') AS table",
          )
        ).rows,
      ).toEqual([{ table: null }]);
    });
  });

  it('rolls back a sidecar that broadens precommitted database admission', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        const before = (
          await administrator.query(
            'SELECT datacl FROM pg_database WHERE datname = current_database()',
          )
        ).rows;
        const initial = shipped[0]!;
        const sidecars =
          initial.sidecars +
          `\nGRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO PUBLIC;`;
        const manifest = {
          ...initial.manifest,
          sidecarsHash: sha256(sidecars),
        };
        const altered = {
          ...initial,
          manifest,
          checksum: jsonHash(manifest),
          sidecars,
        };
        await expect(
          migrateDatabase(
            owner,
            [altered],
            initial.manifest.fingerprint,
            logins,
          ),
        ).rejects.toThrow('precommitted enrollment');
        expect(
          (
            await administrator.query(
              'SELECT datacl FROM pg_database WHERE datname = current_database()',
            )
          ).rows,
        ).toEqual(before);
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
      },
    );
  });

  it('requires the operator to be explicitly enrolled and never infers missing logins', async () => {
    await withDeployment(async ({ owner, logins }) => {
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, [logins[1]]),
      ).rejects.toThrow('operator');
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, []),
      ).rejects.toThrow('nonempty');
    });
  });

  it('revalidates runtime role safety after sidecars before any security drift can commit', async () => {
    await withDeployment(
      async ({ administrator, owner, logins, databaseName }) => {
        const parent = `unsafe_parent_${randomUUID().replaceAll('-', '')}`;
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(parent)} NOLOGIN BYPASSRLS`,
        );
        try {
          // An authored role grant exists only inside the migration transaction.
          // It cannot weaken shared roles seen by concurrently running suites.
          const initial = shipped[0]!;
          const sidecars =
            initial.sidecars +
            `\nGRANT ${escapeIdentifier(parent)} TO studio_app WITH SET TRUE, INHERIT FALSE;`;
          const manifest = {
            ...initial.manifest,
            sidecarsHash: sha256(sidecars),
          };
          const altered = {
            ...initial,
            manifest,
            checksum: jsonHash(manifest),
            sidecars,
          };
          // The administrator can run this synthetic malicious sidecar, while the
          // finalizer must still reject it independently of migration provenance.
          const operator = (
            await administrator.query<{ login: string }>(
              'SELECT session_user AS login',
            )
          ).rows[0]!.login;
          await administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
          );
          await expect(
            migrateDatabase(
              administrator,
              [altered],
              initial.manifest.fingerprint,
              [...logins, operator],
            ),
          ).rejects.toThrow('parent memberships');
          expect(
            (
              await administrator.query(
                "SELECT to_regclass('studio_migrations.history') AS history",
              )
            ).rows,
          ).toEqual([{ history: null }]);
          expect(
            (
              await administrator.query(
                'SELECT count(*)::int AS count FROM pg_auth_members WHERE roleid = $1::regrole',
                [parent],
              )
            ).rows,
          ).toEqual([{ count: 0 }]);
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        } finally {
          await administrator.query(`DROP ROLE ${escapeIdentifier(parent)}`);
        }
      },
    );
  });
  it.each([
    'SET TRUE, INHERIT FALSE',
    'SET FALSE, INHERIT TRUE',
    'SET FALSE, INHERIT FALSE',
  ])(
    'rejects an enrolled runtime member of the database owner (%s)',
    async (options) => {
      await withDeployment(async ({ administrator, owner, url, logins }) => {
        await administrator.query(
          `GRANT ${escapeIdentifier(logins[0])} TO ${escapeIdentifier(logins[1])} WITH ${options}`,
        );
        if (options.startsWith('SET TRUE')) {
          // Prove this is an effective owner escape from the actual pinned pool.
          await connectAs(
            url,
            logins[1],
            '-c role=studio_app',
            async (runtime) => {
              const client = await runtime.connect();
              try {
                await client.query('BEGIN');
                await client.query(`SET ROLE ${escapeIdentifier(logins[0])}`);
                await client.query(
                  'CREATE TABLE public.runtime_owner_escape (id integer)',
                );
                expect(
                  (
                    await client.query(
                      "SELECT to_regclass('public.runtime_owner_escape')::text AS name",
                    )
                  ).rows,
                ).toEqual([{ name: 'runtime_owner_escape' }]);
              } finally {
                await client.query('ROLLBACK');
                client.release();
              }
            },
          );
        }
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('login memberships');
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
        await administrator.query(
          `REVOKE ${escapeIdentifier(logins[0])} FROM ${escapeIdentifier(logins[1])}`,
        );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await connectAs(
          url,
          logins[1],
          '-c role=studio_app',
          async (runtime) => {
            await expect(
              runtime.query(`SET ROLE ${escapeIdentifier(logins[0])}`),
            ).rejects.toMatchObject({ code: '42501' });
          },
        );
      });
    },
  );

  it.each([
    ['unknown role', 'CREATE ROLE', 'SET TRUE, INHERIT FALSE'],
    ['built-in role', 'pg_read_all_data', 'SET TRUE, INHERIT FALSE'],
    ['role administrator', 'studio_app', 'ADMIN TRUE, SET TRUE, INHERIT FALSE'],
    [
      'inherited runtime role',
      'studio_app',
      'ADMIN FALSE, SET TRUE, INHERIT TRUE',
    ],
    [
      'disabled runtime membership',
      'studio_app',
      'ADMIN FALSE, SET FALSE, INHERIT FALSE',
    ],
  ])('refuses scoped membership drift: %s', async (_label, role, options) => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      const parent =
        role === 'CREATE ROLE'
          ? `extra_${randomUUID().replaceAll('-', '')}`
          : role;
      try {
        if (role === 'CREATE ROLE')
          await administrator.query(
            `CREATE ROLE ${escapeIdentifier(parent)} NOLOGIN`,
          );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        await administrator.query(
          `GRANT ${escapeIdentifier(parent)} TO ${escapeIdentifier(logins[1])} WITH ${options}`,
        );
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).rejects.toThrow('login memberships');
        await administrator.query(
          `REVOKE ${escapeIdentifier(parent)} FROM ${escapeIdentifier(logins[1])}`,
        );
        await administrator.query(
          `GRANT studio_app TO ${escapeIdentifier(logins[1])} WITH ADMIN FALSE, SET TRUE, INHERIT FALSE`,
        );
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      } finally {
        if (role === 'CREATE ROLE')
          await administrator.query(
            `DROP ROLE IF EXISTS ${escapeIdentifier(parent)}`,
          );
      }
    });
  });

  it('supports a separate enrolled migration operator and database owner', async () => {
    await withDeployment(
      async ({ administrator, url, logins, databaseName }) => {
        const operator = `separate_operator_${randomUUID().replaceAll('-', '')}`;
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(operator)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
        );
        try {
          await administrator.query(
            `GRANT ${escapeIdentifier(logins[0])} TO ${escapeIdentifier(operator)} WITH SET TRUE, INHERIT TRUE`,
          );
          await administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
          );
          const enrolled = [...logins, operator];
          await connectAs(url, operator, undefined, async (pool) => {
            expect(
              await migrateDatabase(
                pool,
                shipped,
                SCHEMA_FINGERPRINT,
                enrolled,
              ),
            ).toEqual(shipped.map(({ manifest }) => manifest.id));
            expect(
              await migrateDatabase(
                pool,
                shipped,
                SCHEMA_FINGERPRINT,
                enrolled,
              ),
            ).toEqual([]);
          });
          expect(
            (
              await administrator.query(
                'SELECT count(*)::integer AS count FROM studio_migrations.history',
              )
            ).rows,
          ).toEqual([{ count: shipped.length }]);
        } finally {
          await administrator.query(
            `REASSIGN OWNED BY ${escapeIdentifier(operator)} TO ${escapeIdentifier(logins[0])}`,
          );
          await administrator.query(
            `DROP OWNED BY ${escapeIdentifier(operator)}`,
          );
          await administrator.query(`DROP ROLE ${escapeIdentifier(operator)}`);
        }
      },
    );
  });

  it('allows an optional backup login while refusing mixed runtime and backup memberships', async () => {
    await withDeployment(
      async ({ administrator, owner, url, logins, databaseName }) => {
        await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
        const backup = `separate_backup_${randomUUID().replaceAll('-', '')}`;
        await administrator.query(
          `CREATE ROLE ${escapeIdentifier(backup)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD '${password}'`,
        );
        try {
          await administrator.query(
            `GRANT ${BACKUP_ROLE} TO ${escapeIdentifier(backup)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
          );
          await administrator.query(
            `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(backup)}`,
          );
          const enrolled = [...logins, backup];
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, enrolled);
          // This is the legitimate read-only backup provisioning contract.
          // Strict evidence checks preserve these reads, including reads
          // through backup-only views; pre-existing writes are refused separately.
          await administrator.query(`GRANT USAGE ON SCHEMA public, studio_migrations TO ${BACKUP_ROLE};
            GRANT SELECT ON public."schemaFingerprint", studio_migrations.history TO ${BACKUP_ROLE};
            CREATE VIEW backup_evidence_view AS SELECT fingerprint FROM public."schemaFingerprint";
            CREATE MATERIALIZED VIEW backup_evidence_snapshot AS SELECT fingerprint FROM public."schemaFingerprint";
            GRANT SELECT ON backup_evidence_view, backup_evidence_snapshot TO ${BACKUP_ROLE}`);
          const history = (
            await administrator.query('SELECT * FROM studio_migrations.history')
          ).rows;
          const stamp = (
            await administrator.query(
              'SELECT * FROM public."schemaFingerprint"',
            )
          ).rows;
          expect(history).toHaveLength(shipped.length);
          expect(stamp).toHaveLength(1);
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, enrolled),
          ).toEqual([]);
          await connectAs(
            url,
            backup,
            `-c role=${BACKUP_ROLE}`,
            async (pool) => {
              expect(
                (await pool.query('SELECT * FROM studio_migrations.history'))
                  .rows,
              ).toEqual(history);
              expect(
                (await pool.query('SELECT * FROM public."schemaFingerprint"'))
                  .rows,
              ).toEqual(stamp);
              for (const table of [
                'backup_evidence_view',
                'backup_evidence_snapshot',
              ]) {
                expect(
                  (await pool.query(`SELECT fingerprint FROM ${table}`)).rows,
                ).toEqual([{ fingerprint: SCHEMA_FINGERPRINT }]);
              }
              for (const statement of [
                "UPDATE studio_migrations.history SET checksum = 'forged'",
                'DELETE FROM studio_migrations.history',
                'TRUNCATE studio_migrations.history',
                "INSERT INTO studio_migrations.history (position, id, checksum, fingerprint) VALUES (100, 'forged', 'forged', 'forged')",
                'UPDATE public."schemaFingerprint" SET fingerprint = \'forged\'',
                'DELETE FROM public."schemaFingerprint"',
                'TRUNCATE public."schemaFingerprint"',
                'INSERT INTO public."schemaFingerprint" (fingerprint) VALUES (\'forged\')',
              ]) {
                await expect(pool.query(statement)).rejects.toMatchObject({
                  code: '42501',
                });
              }
            },
          );
          await connectAs(
            url,
            backup,
            `-c role=${BACKUP_ROLE}`,
            async (pool) => {
              expect(
                (await pool.query('SELECT current_user AS role')).rows,
              ).toEqual([{ role: BACKUP_ROLE }]);
              for (const role of [
                ...logins,
                'studio_app',
                'studio_maintenance',
              ]) {
                await expect(
                  pool.query(`SET ROLE ${escapeIdentifier(role)}`),
                ).rejects.toMatchObject({ code: '42501' });
              }
            },
          );
          await administrator.query(
            `GRANT studio_app TO ${escapeIdentifier(backup)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
          );
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, enrolled),
          ).rejects.toThrow('backup membership');
          await administrator.query(
            `REVOKE studio_app FROM ${escapeIdentifier(backup)}`,
          );
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, enrolled),
          ).toEqual([]);
        } finally {
          await administrator.query(
            `DROP OWNED BY ${escapeIdentifier(backup)}`,
          );
          await administrator.query(`DROP ROLE ${escapeIdentifier(backup)}`);
        }
      },
    );
  });

  it.each([
    [
      'database CREATE',
      'GRANT CREATE ON DATABASE $database TO $login',
      'REVOKE CREATE ON DATABASE $database FROM $login',
    ],
    [
      'CONNECT grant option',
      'GRANT CONNECT ON DATABASE $database TO $login WITH GRANT OPTION',
      'REVOKE GRANT OPTION FOR CONNECT ON DATABASE $database FROM $login',
    ],
    [
      'schema CREATE',
      'GRANT CREATE ON SCHEMA public TO $login',
      'REVOKE CREATE ON SCHEMA public FROM $login',
    ],
    [
      'direct table write',
      'GRANT UPDATE ON teams TO $login',
      'REVOKE UPDATE ON teams FROM $login',
    ],
    [
      'direct table read',
      'GRANT SELECT ON teams TO $login',
      'REVOKE SELECT ON teams FROM $login',
    ],
    [
      'direct column write',
      'GRANT UPDATE (name) ON teams TO $login',
      'REVOKE UPDATE ON teams FROM $login',
    ],
    [
      'PUBLIC fingerprint write',
      'GRANT UPDATE ON "schemaFingerprint" TO PUBLIC',
      'REVOKE UPDATE ON "schemaFingerprint" FROM PUBLIC',
    ],
    [
      'view write',
      'CREATE VIEW login_access_view AS SELECT id, name FROM teams; GRANT UPDATE ON login_access_view TO $login',
      'DROP VIEW login_access_view',
    ],
    [
      'view column write',
      'CREATE VIEW login_access_view AS SELECT id, name FROM teams; GRANT UPDATE (name) ON login_access_view TO $login',
      'DROP VIEW login_access_view',
    ],
    [
      'materialized view read',
      'CREATE MATERIALIZED VIEW login_access_materialized AS SELECT id, name FROM teams; GRANT SELECT ON login_access_materialized TO $login',
      'DROP MATERIALIZED VIEW login_access_materialized',
    ],
    [
      'foreign table write',
      'CREATE FOREIGN DATA WRAPPER login_access_wrapper; CREATE SERVER login_access_server FOREIGN DATA WRAPPER login_access_wrapper; CREATE FOREIGN TABLE login_access_foreign (id integer) SERVER login_access_server; GRANT UPDATE ON login_access_foreign TO $login',
      'DROP FOREIGN DATA WRAPPER login_access_wrapper CASCADE',
    ],
    [
      'sequence write',
      'CREATE SEQUENCE login_access_sequence; GRANT UPDATE ON SEQUENCE login_access_sequence TO $login',
      'DROP SEQUENCE login_access_sequence',
    ],
    [
      'owned enum type',
      "CREATE TYPE login_owned_enum AS ENUM ('initial'); ALTER TYPE login_owned_enum OWNER TO $login",
      'DROP TYPE login_owned_enum',
    ],
    [
      'runtime role owned type',
      "CREATE TYPE runtime_owned_enum AS ENUM ('initial'); ALTER TYPE runtime_owned_enum OWNER TO studio_app",
      'DROP TYPE runtime_owned_enum',
    ],
    [
      'runtime role CREATE',
      'GRANT CREATE ON SCHEMA public TO studio_app',
      'REVOKE CREATE ON SCHEMA public FROM studio_app',
    ],
    [
      'definer executable only by runtime role',
      "CREATE FUNCTION runtime_write_evidence() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'UPDATE public.\"schemaFingerprint\" SET fingerprint = repeat(''a'', 64)'; REVOKE ALL ON FUNCTION runtime_write_evidence() FROM PUBLIC; GRANT EXECUTE ON FUNCTION runtime_write_evidence() TO studio_app",
      'DROP FUNCTION runtime_write_evidence()',
    ],
    [
      'owned function',
      "CREATE FUNCTION login_owned_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'; ALTER FUNCTION login_owned_function() OWNER TO $login",
      'DROP FUNCTION login_owned_function()',
    ],
    [
      'owned table',
      'CREATE TABLE login_owned_table (id integer); ALTER TABLE login_owned_table OWNER TO $login',
      'DROP TABLE login_owned_table',
    ],
    [
      'owned schema',
      'CREATE SCHEMA login_owned_schema AUTHORIZATION $login',
      'DROP SCHEMA login_owned_schema',
    ],
    [
      'executable definer',
      "CREATE FUNCTION login_write_evidence() RETURNS void LANGUAGE sql SECURITY DEFINER AS 'UPDATE public.\"schemaFingerprint\" SET fingerprint = repeat(''a'', 64)'",
      'DROP FUNCTION login_write_evidence()',
    ],
  ])(
    'refuses login access outside scoped roles on a no-op migration: %s',
    async (kind, corrupt, restore) => {
      await withDeployment(
        async ({ administrator, owner, url, logins, databaseName }) => {
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
          const substitute = (sql: string) =>
            sql
              .replaceAll('$database', escapeIdentifier(databaseName))
              .replaceAll('$login', escapeIdentifier(logins[1]));
          await administrator.query(substitute(corrupt));
          if (
            kind === 'view write' ||
            kind === 'view column write' ||
            kind === 'executable definer'
          ) {
            // Demonstrate effective data mutation after leaving the pinned role,
            // then roll the proof back before asking the migrator to refuse it.
            await owner.query(
              "INSERT INTO teams (id,name,slug) VALUES ('login-proof','BEFORE','login-proof')",
            );
            await connectAs(
              url,
              logins[1],
              '-c role=studio_app',
              async (runtime) => {
                const client = await runtime.connect();
                try {
                  await client.query('BEGIN');
                  await client.query('SET ROLE NONE');
                  expect(
                    (await client.query('SELECT current_user AS role')).rows,
                  ).toEqual([{ role: logins[1] }]);
                  if (kind === 'executable definer') {
                    await client.query('SELECT login_write_evidence()');
                    // The login cannot SELECT this table. The same backend returns
                    // to studio_app solely to inspect the already-performed write.
                    await client.query('SET ROLE studio_app');
                    expect(
                      (
                        await client.query(
                          'SELECT fingerprint FROM "schemaFingerprint"',
                        )
                      ).rows,
                    ).toEqual([{ fingerprint: 'a'.repeat(64) }]);
                  } else {
                    await client.query(
                      "UPDATE login_access_view SET name='LOGIN_WRITE'",
                    );
                    await client.query('SET ROLE studio_app');
                    expect(
                      (
                        await client.query(
                          "SELECT name FROM teams WHERE id='login-proof'",
                        )
                      ).rows,
                    ).toEqual([{ name: 'LOGIN_WRITE' }]);
                  }
                } finally {
                  await client.query('ROLLBACK');
                  client.release();
                }
              },
            );
          }
          const before = (
            await administrator.query('SELECT * FROM studio_migrations.history')
          ).rows;
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).rejects.toThrow('access outside their reviewed Studio roles');
          expect(
            (
              await administrator.query(
                'SELECT * FROM studio_migrations.history',
              )
            ).rows,
          ).toEqual(before);
          await administrator.query(substitute(restore));
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).toEqual([]);
        },
      );
    },
  );
  it.each(['membership', 'direct grant'])(
    'rolls back login privilege drift introduced by a sidecar: %s',
    async (drift) => {
      await withDeployment(async ({ administrator, logins, databaseName }) => {
        const operator = (
          await administrator.query<{ login: string }>(
            'SELECT session_user AS login',
          )
        ).rows[0]!.login;
        await administrator.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
        );
        const initial = shipped[0]!;
        const sidecars =
          initial.sidecars +
          (drift === 'membership'
            ? `\nGRANT ${escapeIdentifier(logins[0])} TO ${escapeIdentifier(logins[1])} WITH SET TRUE, INHERIT FALSE;`
            : `\nGRANT SELECT ON public.teams TO ${escapeIdentifier(logins[1])};`);
        const manifest = {
          ...initial.manifest,
          sidecarsHash: sha256(sidecars),
        };
        const altered = {
          ...initial,
          manifest,
          checksum: jsonHash(manifest),
          sidecars,
        };
        await expect(
          migrateDatabase(
            administrator,
            [altered],
            initial.manifest.fingerprint,
            [...logins, operator],
          ),
        ).rejects.toThrow(
          drift === 'membership'
            ? 'login memberships'
            : 'access outside their reviewed Studio roles',
        );
        expect(
          (
            await administrator.query(
              "SELECT to_regclass('studio_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
        expect(
          (
            await administrator.query(
              "SELECT pg_has_role($1, $2, 'SET') AS can_assume",
              [logins[1], logins[0]],
            )
          ).rows,
        ).toEqual([{ can_assume: false }]);
      });
    },
  );
  it('revalidates an existing optional backup role without changing its attributes', async () => {
    await withDeployment(async ({ administrator, logins, databaseName }) => {
      await administrator.query(runtimeRolesSql([BACKUP_ROLE]));
      const operator = (
        await administrator.query<{ login: string }>(
          'SELECT session_user AS login',
        )
      ).rows[0]!.login;
      await administrator.query(
        `GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${escapeIdentifier(operator)}`,
      );
      const client = await administrator.connect();
      try {
        await client.query('BEGIN');
        await enforceMigrationSecurity(client, [...logins, operator]);
        await client.query(`ALTER ROLE ${BACKUP_ROLE} CREATEDB`);
        await expect(
          enforceMigrationSecurity(client, [...logins, operator]),
        ).rejects.toThrow('runtime roles must');
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
      expect(
        (
          await administrator.query(
            'SELECT rolcreatedb FROM pg_roles WHERE rolname = $1',
            [BACKUP_ROLE],
          )
        ).rows,
      ).toEqual([{ rolcreatedb: false }]);
    });
  });

  it.each(['studio_app', 'studio_maintenance', BACKUP_ROLE])(
    'refuses owner-backed relation privileges held by scoped role %s',
    async (role) => {
      await withDeployment(async ({ administrator, owner, logins }) => {
        // Any missing optional role is safely provisioned within a transaction;
        // no existing cluster-wide role's attributes or memberships are changed.
        await administrator.query(
          `BEGIN; ${runtimeRolesSql([BACKUP_ROLE])} COMMIT`,
        );
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
        const before = (
          await administrator.query('SELECT * FROM studio_migrations.history')
        ).rows;
        const stamp = (
          await administrator.query('SELECT * FROM public."schemaFingerprint"')
        ).rows;
        expect(before).toHaveLength(shipped.length);
        expect(stamp).toHaveLength(1);
        const cases: {
          kind: string;
          create: string;
          grant: string;
          drop: string;
          write?: string;
        }[] = [
          {
            kind: 'view write',
            create:
              'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
            grant: 'UPDATE ON runtime_evidence_view',
            drop: 'DROP VIEW runtime_evidence_view',
            write: 'fingerprint',
          },
          {
            kind: 'view sibling column write',
            create:
              'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
            grant: 'UPDATE (sibling) ON runtime_evidence_view',
            drop: 'DROP VIEW runtime_evidence_view',
            write: 'sibling',
          },
          {
            kind: 'materialized view maintenance',
            create:
              'CREATE MATERIALIZED VIEW runtime_evidence_snapshot AS SELECT fingerprint FROM public."schemaFingerprint"',
            grant: 'MAINTAIN ON runtime_evidence_snapshot',
            drop: 'DROP MATERIALIZED VIEW runtime_evidence_snapshot',
          },
          {
            kind: 'foreign table write',
            create:
              'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
            grant: 'UPDATE ON runtime_evidence_foreign',
            drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
          },
          {
            kind: 'foreign table sibling column write',
            create:
              'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
            grant: 'UPDATE (sibling) ON runtime_evidence_foreign',
            drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
          },
          ...(role === BACKUP_ROLE
            ? []
            : [
                {
                  kind: 'view read',
                  create:
                    'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
                  grant: 'SELECT ON runtime_evidence_view',
                  drop: 'DROP VIEW runtime_evidence_view',
                },
                {
                  kind: 'view sibling column read',
                  create:
                    'CREATE VIEW runtime_evidence_view AS SELECT fingerprint, fingerprint AS sibling FROM public."schemaFingerprint"',
                  grant: 'SELECT (sibling) ON runtime_evidence_view',
                  drop: 'DROP VIEW runtime_evidence_view',
                },
                {
                  kind: 'materialized view read',
                  create:
                    'CREATE MATERIALIZED VIEW runtime_evidence_snapshot AS SELECT fingerprint FROM public."schemaFingerprint"',
                  grant: 'SELECT ON runtime_evidence_snapshot',
                  drop: 'DROP MATERIALIZED VIEW runtime_evidence_snapshot',
                },
                {
                  kind: 'foreign table read',
                  create:
                    'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
                  grant: 'SELECT ON runtime_evidence_foreign',
                  drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
                },
                {
                  kind: 'foreign table sibling column read',
                  create:
                    'CREATE FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE SERVER runtime_evidence_server FOREIGN DATA WRAPPER runtime_evidence_wrapper; CREATE FOREIGN TABLE runtime_evidence_foreign (first_column text, sibling text) SERVER runtime_evidence_server',
                  grant: 'SELECT (sibling) ON runtime_evidence_foreign',
                  drop: 'DROP FOREIGN DATA WRAPPER runtime_evidence_wrapper CASCADE',
                },
              ]),
        ];
        expect(cases).toHaveLength(role === BACKUP_ROLE ? 5 : 10);
        for (const fixture of cases) {
          await administrator.query(
            `${fixture.create}; GRANT ${fixture.grant} TO ${escapeIdentifier(role)}`,
          );
          if (fixture.write) {
            const client = await administrator.connect();
            try {
              await client.query('BEGIN');
              // Schema usage is local to this proof and rolls back. This also
              // covers an optional role whose backup sidecar is not installed.
              await client.query(
                `GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(role)}`,
              );
              await client.query(`SET LOCAL ROLE ${escapeIdentifier(role)}`);
              expect(
                (await client.query('SELECT current_user AS role')).rows,
              ).toEqual([{ role }]);
              expect(
                (
                  await client.query(
                    `UPDATE public.runtime_evidence_view SET ${escapeIdentifier(fixture.write)} = repeat('a', 64)`,
                  )
                ).rowCount,
              ).toBe(1);
              await client.query('RESET ROLE');
              expect(
                (
                  await client.query(
                    'SELECT fingerprint FROM public."schemaFingerprint"',
                  )
                ).rows,
              ).toEqual([{ fingerprint: 'a'.repeat(64) }]);
            } finally {
              await client.query('ROLLBACK');
              client.release();
            }
          }
          await expect(
            migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
            fixture.kind,
          ).rejects.toThrow('access outside their reviewed Studio roles');
          expect(
            (
              await administrator.query(
                'SELECT * FROM studio_migrations.history',
              )
            ).rows,
          ).toEqual(before);
          expect(
            (
              await administrator.query(
                'SELECT * FROM public."schemaFingerprint"',
              )
            ).rows,
          ).toEqual(stamp);
          await administrator.query(fixture.drop);
          expect(
            await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          ).toEqual([]);
        }
      });
    },
  );

  it('refuses backup base-table writes when migration evidence does not exist yet', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await administrator.query(
        `BEGIN; ${runtimeRolesSql([BACKUP_ROLE])} COMMIT`,
      );
      // Same-name tables in another schema are not migration evidence. Both
      // real evidence OIDs are NULL before this first migration.
      await administrator.query(`CREATE SCHEMA backup_relations;
        CREATE TABLE backup_relations.history (id integer, sibling boolean);
        INSERT INTO backup_relations.history VALUES (1, false);
        GRANT USAGE ON SCHEMA backup_relations TO ${BACKUP_ROLE};
        GRANT SELECT, UPDATE ON backup_relations.history TO ${BACKUP_ROLE}`);
      expect(
        (
          await administrator.query(
            `SELECT to_regclass('studio_migrations.history') AS history, to_regclass('public."schemaFingerprint"') AS fingerprint`,
          )
        ).rows,
      ).toEqual([{ history: null, fingerprint: null }]);
      // A postflight check can mask a NULL bug once migration has created the
      // evidence tables. The real preflight must refuse before any SQL runs.
      const preflight = await owner.connect();
      try {
        await preflight.query('BEGIN');
        await expect(
          enforceMigrationSecurity(preflight, logins),
        ).rejects.toThrow('access outside their reviewed Studio roles');
      } finally {
        await preflight.query('ROLLBACK');
        preflight.release();
      }
      await expect(
        migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).rejects.toThrow('access outside their reviewed Studio roles');
      expect(
        (await administrator.query('SELECT * FROM backup_relations.history'))
          .rows,
      ).toEqual([{ id: 1, sibling: false }]);
      await administrator.query(
        `REVOKE UPDATE ON backup_relations.history FROM ${BACKUP_ROLE}`,
      );
      expect(
        await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
      ).toEqual(shipped.map((migration) => migration.manifest.id));
    });
  });

  it('refuses backup base-table, sibling-column, partitioned-table and sequence writes while preserving reads', async () => {
    await withDeployment(async ({ administrator, owner, logins }) => {
      await administrator.query(
        `BEGIN; ${runtimeRolesSql([BACKUP_ROLE])} COMMIT`,
      );
      await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins);
      await administrator.query(`INSERT INTO public."user" (id, name, email, "emailVerified") VALUES ('backup-proof', 'Backup proof', 'backup-proof@example.test', false);
        CREATE SCHEMA backup_relations;
        CREATE TABLE backup_relations.history (id integer, sibling boolean);
        INSERT INTO backup_relations.history VALUES (1, false);
        CREATE TABLE backup_relations."schemaFingerprint" (id integer, sibling boolean) PARTITION BY LIST (id);
        CREATE TABLE backup_relations.partition_one PARTITION OF backup_relations."schemaFingerprint" FOR VALUES IN (1);
        INSERT INTO backup_relations."schemaFingerprint" VALUES (1, false);
        CREATE SEQUENCE backup_relations.counter;
        GRANT USAGE ON SCHEMA public, backup_relations TO ${BACKUP_ROLE};
        GRANT SELECT ON public."user", backup_relations.history, backup_relations."schemaFingerprint" TO ${BACKUP_ROLE};
        GRANT SELECT ON SEQUENCE backup_relations.counter TO ${BACKUP_ROLE}`);
      const history = (
        await administrator.query('SELECT * FROM studio_migrations.history')
      ).rows;
      const stamp = (
        await administrator.query('SELECT * FROM public."schemaFingerprint"')
      ).rows;
      expect(history).toHaveLength(shipped.length);
      expect(stamp).toHaveLength(1);
      const cases: { grant: string; proveUserWrite?: boolean }[] = [
        { grant: 'UPDATE ON public."user"', proveUserWrite: true },
        {
          grant: 'UPDATE ("emailVerified") ON public."user"',
          proveUserWrite: true,
        },
        ...[
          'INSERT',
          'UPDATE',
          'DELETE',
          'TRUNCATE',
          'REFERENCES',
          'TRIGGER',
          'MAINTAIN',
        ].map((privilege) => ({
          grant: `${privilege} ON backup_relations.history`,
        })),
        ...['INSERT', 'UPDATE', 'REFERENCES'].map((privilege) => ({
          grant: `${privilege} (sibling) ON backup_relations.history`,
        })),
        { grant: 'UPDATE ON backup_relations."schemaFingerprint"' },
        { grant: 'UPDATE (sibling) ON backup_relations."schemaFingerprint"' },
        { grant: 'USAGE ON SEQUENCE backup_relations.counter' },
        { grant: 'UPDATE ON SEQUENCE backup_relations.counter' },
      ];
      expect(cases).toHaveLength(16);
      for (const fixture of cases) {
        await administrator.query(`GRANT ${fixture.grant} TO ${BACKUP_ROLE}`);
        if (fixture.proveUserWrite) {
          const client = await administrator.connect();
          try {
            await client.query('BEGIN');
            await client.query(`SET LOCAL ROLE ${BACKUP_ROLE}`);
            expect(
              (await client.query('SELECT current_user AS role')).rows,
            ).toEqual([{ role: BACKUP_ROLE }]);
            expect(
              (
                await client.query(
                  'UPDATE public."user" SET "emailVerified" = true',
                )
              ).rowCount,
            ).toBe(1);
            expect(
              (await client.query('SELECT "emailVerified" FROM public."user"'))
                .rows,
            ).toEqual([{ emailVerified: true }]);
          } finally {
            await client.query('ROLLBACK');
            client.release();
          }
        }
        await expect(
          migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
          fixture.grant,
        ).rejects.toThrow('access outside their reviewed Studio roles');
        expect(
          (await administrator.query('SELECT * FROM studio_migrations.history'))
            .rows,
        ).toEqual(history);
        expect(
          (
            await administrator.query(
              'SELECT * FROM public."schemaFingerprint"',
            )
          ).rows,
        ).toEqual(stamp);
        await administrator.query(
          `REVOKE ${fixture.grant} FROM ${BACKUP_ROLE}`,
        );
        expect(
          await migrateDatabase(owner, shipped, SCHEMA_FINGERPRINT, logins),
        ).toEqual([]);
      }
      const client = await administrator.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL ROLE ${BACKUP_ROLE}`);
        expect(
          (await client.query('SELECT "emailVerified" FROM public."user"'))
            .rows,
        ).toEqual([{ emailVerified: false }]);
        for (const table of [
          'backup_relations.history',
          'backup_relations."schemaFingerprint"',
        ]) {
          expect((await client.query(`SELECT * FROM ${table}`)).rows).toEqual([
            { id: 1, sibling: false },
          ]);
        }
        expect(
          (
            await client.query(
              'SELECT last_value::int AS last_value FROM backup_relations.counter',
            )
          ).rows,
        ).toEqual([{ last_value: 1 }]);
      } finally {
        await client.query('ROLLBACK');
        client.release();
      }
    });
  });
});
