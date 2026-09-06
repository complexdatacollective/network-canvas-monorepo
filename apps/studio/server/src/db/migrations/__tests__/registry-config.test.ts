import { randomUUID } from 'node:crypto';

import { escapeIdentifier, Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  jsonHash,
  sha256,
  type Migration,
} from '@codaco/studio-sync/postgres-migration-artifacts';
import {
  createPostgresMigrator,
  type PostgresMigrationConfig,
} from '@codaco/studio-sync/postgres-migrations';
import { runtimeRolesSql } from '@codaco/studio-sync/role-bootstrap';

import {
  createScratchDatabase,
  reachableDb,
} from '../../../__tests__/support/postgres.ts';
import type { DbEnv } from '../../../env.ts';
import { SCHEMA_LOCK_KEY } from '../../schema.ts';

const database = await reachableDb();
const password = 'registry-migration-test-only';
// Distinct from Studio's schema (4021775688147129) and role bootstrap
// (4021775688147130) locks, even if tools target one database by mistake.
const REGISTRY_SCHEMA_LOCK_KEY = 4021775688147131;
const fingerprint = sha256('registry migration fixture schema version 1');
type RegistryRoles = { app: string; operator: string; backup: string };

function registryConfig(roles: RegistryRoles): PostgresMigrationConfig {
  return {
    applicationName: 'Registry',
    allowedLoginsSetting: 'REGISTRY_DATABASE_ALLOWED_LOGINS',
    runtimeRoles: [roles.app, roles.operator],
    backupRole: roles.backup,
    historySchema: 'registry_migrations',
    schemaName: 'public',
    fingerprintTable: 'registry_schema_fingerprint',
    lockKey: REGISTRY_SCHEMA_LOCK_KEY,
    stampFingerprint: async (client, value) => {
      await client.query(
        `INSERT INTO registry_schema_fingerprint (fingerprint) VALUES ($1)
         ON CONFLICT (id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, applied_at = CURRENT_TIMESTAMP`,
        [value],
      );
    },
  };
}

function artifact(roles: RegistryRoles, extraSidecars = ''): Migration {
  // The shared engine owns deployment mechanics; this small application
  // schema exercises the registry role/configuration seam independently of
  // the registry service's separately tested domain schema.
  const sql = `CREATE TABLE registry_schema_fingerprint (
      id boolean PRIMARY KEY DEFAULT true CHECK (id),
      fingerprint text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE registry_items (id integer PRIMARY KEY, value text NOT NULL);`;
  const names = [roles.app, roles.operator].map(escapeIdentifier).join(', ');
  const sidecars = `REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO ${names};
    GRANT SELECT, INSERT ON registry_items TO ${escapeIdentifier(roles.app)};
    GRANT SELECT, UPDATE ON registry_items TO ${escapeIdentifier(roles.operator)};
    GRANT ALL ON registry_schema_fingerprint TO ${names};
    ${extraSidecars}`;
  const snapshot = { fixture: 'registry', version: 1 };
  const manifest = {
    format: 1 as const,
    id: '0001_registry',
    previous: null,
    fingerprint,
    snapshotHash: jsonHash(snapshot),
    sqlHash: sha256(sql),
    sidecarsHash: sha256(sidecars),
  };
  return { sql, sidecars, snapshot, manifest, checksum: jsonHash(manifest) };
}

async function createDeployment(db: DbEnv, roles: RegistryRoles) {
  const scratch = await createScratchDatabase(db);
  const administrator = new Pool({ connectionString: db.url });
  const url = new URL(scratch.db.url);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const suffix = randomUUID().replaceAll('-', '');
  const logins = {
    owner: `registry_owner_${suffix}`,
    app: `registry_login_${suffix}`,
    operator: `registry_mod_${suffix}`,
  };
  const allowedLogins = Object.values(logins);
  const pools: Pool[] = [];
  const connect = (login: string, options?: string) => {
    const target = new URL(url);
    target.username = login;
    target.password = password;
    if (options) target.searchParams.set('options', options);
    const pool = new Pool({
      connectionString: target.href,
      connectionTimeoutMillis: 1500,
    });
    pools.push(pool);
    return pool;
  };
  const dispose = async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    await scratch.dispose();
    await administrator.query(
      `DROP ROLE IF EXISTS ${allowedLogins.map(escapeIdentifier).join(', ')}`,
    );
    await administrator.end();
  };
  try {
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} ALLOW_CONNECTIONS false`,
    );
    for (const login of allowedLogins) {
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '${password}'`,
      );
    }
    await administrator.query(
      `GRANT ${escapeIdentifier(roles.app)} TO ${escapeIdentifier(logins.app)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
    );
    await administrator.query(
      `GRANT ${escapeIdentifier(roles.operator)} TO ${escapeIdentifier(logins.operator)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
    );
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} OWNER TO ${escapeIdentifier(logins.owner)}`,
    );
    await administrator.query(`REVOKE CONNECT ON DATABASE ${escapeIdentifier(databaseName)} FROM PUBLIC;
      GRANT CONNECT ON DATABASE ${escapeIdentifier(databaseName)} TO ${allowedLogins.map(escapeIdentifier).join(', ')}`);
    await administrator.query(
      `ALTER DATABASE ${escapeIdentifier(databaseName)} ALLOW_CONNECTIONS true`,
    );
    const owner = connect(logins.owner, '-c search_path=pg_catalog');
    const config = registryConfig(roles);
    return {
      owner,
      administrator: scratch.pool,
      databaseName,
      logins,
      allowedLogins,
      connect,
      config,
      dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

async function withRegistryCluster(
  run: (
    create: () => Promise<Awaited<ReturnType<typeof createDeployment>>>,
    roles: RegistryRoles,
  ) => Promise<void>,
) {
  if (!database)
    throw new Error('Database required for registry migration tests.');
  const administrator = new Pool({ connectionString: database.url });
  const suffix = randomUUID().replaceAll('-', '');
  const roles: RegistryRoles = {
    app: `registry_app_${suffix}`,
    operator: `registry_operator_${suffix}`,
    backup: `registry_backup_${suffix}`,
  };
  const deployments: Awaited<ReturnType<typeof createDeployment>>[] = [];
  try {
    await administrator.query(
      runtimeRolesSql([roles.app, roles.operator], 'Registry'),
    );
    await run(async () => {
      const deployment = await createDeployment(database, roles);
      deployments.push(deployment);
      return deployment;
    }, roles);
  } finally {
    for (const deployment of deployments.toReversed())
      await deployment.dispose();
    await administrator.query(
      `DROP ROLE IF EXISTS ${Object.values(roles).map(escapeIdentifier).join(', ')}`,
    );
    await administrator.end();
  }
}

describe.skipIf(!database)(
  'shared migration engine with registry configuration',
  () => {
    it('refuses existing objects in the configured schema before applying SQL', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        await deployment.administrator.query(
          "CREATE SCHEMA registry_data; CREATE TABLE registry_data.original (value text); INSERT INTO registry_data.original VALUES ('preserve me')",
        );
        const migrator = createPostgresMigrator({
          ...deployment.config,
          schemaName: 'registry_data',
        });
        await expect(
          migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).rejects.toThrow('registry_data is not empty');
        expect(
          (
            await deployment.administrator.query(
              'SELECT * FROM registry_data.original',
            )
          ).rows,
        ).toEqual([{ value: 'preserve me' }]);
        expect(
          (
            await deployment.administrator.query(
              "SELECT to_regclass('registry_migrations.history') AS history",
            )
          ).rows,
        ).toEqual([{ history: null }]);
      });
    });

    it('quotes configured schema, history, and fingerprint identifiers in actual SQL', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        const schemaName = 'registry-schema"quoted';
        const historySchema = 'registry-history"quoted';
        const fingerprintTable = 'fingerprint"quoted';
        const table = `${escapeIdentifier(schemaName)}.${escapeIdentifier(fingerprintTable)}`;
        const initial = artifact(roles);
        const sql = `CREATE SCHEMA ${escapeIdentifier(schemaName)};\n${initial.sql.replaceAll('registry_schema_fingerprint', escapeIdentifier(fingerprintTable))}`;
        const sidecars = initial.sidecars
          .replaceAll('public', escapeIdentifier(schemaName))
          .replaceAll(
            'registry_schema_fingerprint',
            escapeIdentifier(fingerprintTable),
          );
        const manifest = {
          ...initial.manifest,
          sqlHash: sha256(sql),
          sidecarsHash: sha256(sidecars),
        };
        const migration = {
          ...initial,
          sql,
          sidecars,
          manifest,
          checksum: jsonHash(manifest),
        };
        const migrator = createPostgresMigrator({
          ...deployment.config,
          schemaName,
          historySchema,
          fingerprintTable,
          stampFingerprint: async (client, value) => {
            await client.query(
              `INSERT INTO ${escapeIdentifier(fingerprintTable)} (fingerprint) VALUES ($1)`,
              [value],
            );
          },
        });
        expect(
          await migrator.migrate(
            deployment.owner,
            [migration],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual(['0001_registry']);
        expect(
          (
            await deployment.administrator.query(
              `SELECT fingerprint FROM ${table}`,
            )
          ).rows,
        ).toEqual([{ fingerprint }]);
        expect(
          (
            await deployment.administrator.query(
              `SELECT id FROM ${escapeIdentifier(historySchema)}.history`,
            )
          ).rows,
        ).toEqual([{ id: '0001_registry' }]);
        await deployment.administrator.query(
          runtimeRolesSql([roles.backup], 'Registry'),
        );
        await deployment.administrator
          .query(`GRANT USAGE ON SCHEMA ${escapeIdentifier(schemaName)}, ${escapeIdentifier(historySchema)} TO ${escapeIdentifier(roles.backup)};
          GRANT ALL ON ${escapeIdentifier(historySchema)}.history, ${table} TO ${escapeIdentifier(roles.backup)} WITH GRANT OPTION`);
        expect(
          await migrator.migrate(
            deployment.owner,
            [migration],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual([]);
        for (const evidence of [
          `${escapeIdentifier(historySchema)}.history`,
          table,
        ]) {
          expect(
            (
              await deployment.administrator.query(
                `SELECT has_table_privilege($1, $2, 'SELECT') AS readable,
                  has_any_column_privilege($1, $2, 'INSERT,UPDATE,REFERENCES') AS writes,
                  has_table_privilege($1, $2, 'SELECT WITH GRANT OPTION') AS delegate_reads`,
                [roles.backup, evidence],
              )
            ).rows,
          ).toEqual([{ readable: true, writes: false, delegate_reads: false }]);
        }
        const app = deployment.connect(
          deployment.logins.app,
          `-c role=${roles.app}`,
        );
        expect(
          (await app.query(`SELECT fingerprint FROM ${table}`)).rows,
        ).toEqual([{ fingerprint }]);
        await expect(app.query(`DELETE FROM ${table}`)).rejects.toMatchObject({
          code: '42501',
        });
      });
    });

    it('uses registry evidence, copies configuration, pins its schema, and preserves no-op timestamps', async () => {
      expect(REGISTRY_SCHEMA_LOCK_KEY).not.toBe(SCHEMA_LOCK_KEY);
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        const mutableRoles = [roles.app, roles.operator];
        const mutableConfig = {
          ...deployment.config,
          runtimeRoles: mutableRoles,
        };
        const migrator = createPostgresMigrator(mutableConfig);
        mutableRoles.splice(0, 2, 'wrong_role');
        mutableConfig.historySchema = 'wrong_history';
        mutableConfig.fingerprintTable = 'wrong_stamp';
        expect(
          await migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual(['0001_registry']);
        const before = (
          await deployment.administrator.query(
            'SELECT * FROM public.registry_schema_fingerprint',
          )
        ).rows;
        expect(before).toHaveLength(1);
        expect(before[0]).toMatchObject({ fingerprint });
        const history = (
          await deployment.administrator.query(
            'SELECT * FROM registry_migrations.history',
          )
        ).rows;
        expect(history).toHaveLength(1);
        expect(
          await migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual([]);
        expect(
          (
            await deployment.administrator.query(
              'SELECT * FROM registry_migrations.history',
            )
          ).rows,
        ).toEqual(history);
        expect(
          (
            await deployment.administrator.query(
              'SELECT * FROM public.registry_schema_fingerprint',
            )
          ).rows,
        ).toEqual(before);
        expect(
          (
            await deployment.administrator.query(
              `SELECT to_regclass('studio_migrations.history') AS studio_history, to_regclass('public."schemaFingerprint"') AS studio_stamp, to_regclass('wrong_history.history') AS wrong_history`,
            )
          ).rows,
        ).toEqual([
          { studio_history: null, studio_stamp: null, wrong_history: null },
        ]);
        expect((await deployment.owner.query('SHOW search_path')).rows).toEqual(
          [{ search_path: 'pg_catalog' }],
        );
        expect(
          (
            await deployment.administrator.query(
              'SELECT rolname FROM pg_roles WHERE rolname = $1',
              [roles.backup],
            )
          ).rows,
        ).toEqual([]);
      });
    });

    it('gives the app and moderator only their own role and denies all evidence writes', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        await createPostgresMigrator(deployment.config).migrate(
          deployment.owner,
          [artifact(roles)],
          fingerprint,
          deployment.allowedLogins,
        );
        const cases = [
          {
            login: deployment.logins.app,
            role: roles.app,
            other: roles.operator,
          },
          {
            login: deployment.logins.operator,
            role: roles.operator,
            other: roles.app,
          },
        ];
        expect(cases).toHaveLength(2);
        for (const { login, role, other } of cases) {
          const runtime = deployment.connect(login, `-c role=${role}`);
          expect(
            (await runtime.query('SELECT current_user AS role')).rows,
          ).toEqual([{ role }]);
          await runtime.query('RESET ROLE');
          expect(
            (await runtime.query('SELECT current_user AS role')).rows,
          ).toEqual([{ role }]);
          expect(
            (
              await runtime.query(
                'SELECT fingerprint FROM registry_schema_fingerprint',
              )
            ).rows,
          ).toEqual([{ fingerprint }]);
          for (const sql of [
            `SET ROLE ${escapeIdentifier(other)}`,
            'SELECT * FROM registry_migrations.history',
            "UPDATE registry_schema_fingerprint SET fingerprint = 'forged'",
            'DELETE FROM registry_schema_fingerprint',
            'TRUNCATE registry_schema_fingerprint',
            "INSERT INTO registry_schema_fingerprint (fingerprint) VALUES ('forged')",
          ])
            await expect(runtime.query(sql)).rejects.toMatchObject({
              code: '42501',
            });
          await runtime.query('SET ROLE NONE');
          await expect(
            runtime.query('SELECT * FROM public.registry_items'),
          ).rejects.toMatchObject({ code: '42501' });
        }
        const app = deployment.connect(
          deployment.logins.app,
          `-c role=${roles.app}`,
        );
        const operator = deployment.connect(
          deployment.logins.operator,
          `-c role=${roles.operator}`,
        );
        await app.query("INSERT INTO registry_items VALUES (1, 'published')");
        await operator.query(
          "UPDATE registry_items SET value = 'moderated' WHERE id = 1",
        );
        expect((await app.query('SELECT * FROM registry_items')).rows).toEqual([
          { id: 1, value: 'moderated' },
        ]);
      });
    });

    it('rejects cross-registry database admission despite shared cluster roles and hostile startup options', async () => {
      await withRegistryCluster(async (create, roles) => {
        const first = await create();
        const second = await create();
        for (const deployment of [first, second]) {
          await createPostgresMigrator(deployment.config).migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          );
          expect(
            (
              await deployment
                .connect(deployment.logins.app, `-c role=${roles.app}`)
                .query('SELECT * FROM registry_items')
            ).rows,
          ).toEqual([]);
        }
        for (const [source, target] of [
          [first, second],
          [second, first],
        ] as const) {
          for (const login of source.allowedLogins) {
            for (const role of [
              undefined,
              roles.app,
              roles.operator,
              target.logins.owner,
            ]) {
              await expect(
                target
                  .connect(login, role ? `-c role=${role}` : undefined)
                  .query('SELECT 1'),
              ).rejects.toMatchObject({ code: '42501' });
            }
          }
        }
      });
    });

    it('requires enrollment before SQL and rolls back a sidecar that broadens admission', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        const migrator = createPostgresMigrator(deployment.config);
        const databaseName = escapeIdentifier(deployment.databaseName);
        await deployment.administrator.query(
          `REVOKE CONNECT ON DATABASE ${databaseName} FROM ${escapeIdentifier(deployment.logins.app)}`,
        );
        const initial = artifact(roles);
        const sql = 'SELECT 1 / 0;';
        const manifest = { ...initial.manifest, sqlHash: sha256(sql) };
        const failing = {
          ...initial,
          sql,
          manifest,
          checksum: jsonHash(manifest),
        };
        await expect(
          migrator.migrate(
            deployment.owner,
            [failing],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).rejects.toThrow('precommitted enrollment');
        await deployment.administrator.query(
          `GRANT CONNECT ON DATABASE ${databaseName} TO ${escapeIdentifier(deployment.logins.app)}`,
        );
        await expect(
          migrator.migrate(
            deployment.owner,
            [
              artifact(
                roles,
                `GRANT CONNECT ON DATABASE ${databaseName} TO PUBLIC;`,
              ),
            ],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).rejects.toThrow('precommitted enrollment');
        expect(
          (
            await deployment.administrator.query(
              "SELECT to_regclass('registry_migrations.history') AS history, to_regclass('public.registry_items') AS items",
            )
          ).rows,
        ).toEqual([{ history: null, items: null }]);
        expect(
          await migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual(['0001_registry']);
      });
    });

    it('validates an existing registry backup role without creating it or granting memberships', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        const migrator = createPostgresMigrator(deployment.config);
        await migrator.migrate(
          deployment.owner,
          [artifact(roles)],
          fingerprint,
          deployment.allowedLogins,
        );
        await deployment.administrator.query(
          runtimeRolesSql([roles.backup], 'Registry'),
        );
        expect(
          await migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual([]);
        await deployment.administrator.query(
          `ALTER ROLE ${escapeIdentifier(roles.backup)} CREATEDB`,
        );
        await expect(
          migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).rejects.toThrow('Registry runtime roles must');
        expect(
          (
            await deployment.administrator.query(
              'SELECT rolcreatedb FROM pg_roles WHERE rolname = $1',
              [roles.backup],
            )
          ).rows,
        ).toEqual([{ rolcreatedb: true }]);
        expect(
          (
            await deployment.administrator.query(
              'SELECT membership.member FROM pg_auth_members membership JOIN pg_roles role ON role.oid = membership.roleid WHERE role.rolname = $1',
              [roles.backup],
            )
          ).rows,
        ).toEqual([]);
      });
    });

    it('refuses owner-backed view reads when no backup role is configured', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        const { backupRole, ...config } = deployment.config;
        expect(backupRole).toBe(roles.backup);
        const migrator = createPostgresMigrator(config);
        const initial = artifact(roles);
        await migrator.migrate(
          deployment.owner,
          [initial],
          fingerprint,
          deployment.allowedLogins,
        );
        const history = (
          await deployment.administrator.query(
            'SELECT * FROM registry_migrations.history',
          )
        ).rows;
        expect(history).toHaveLength(1);
        const cases = [
          { login: deployment.logins.app, role: roles.app },
          { login: deployment.logins.operator, role: roles.operator },
        ];
        expect(cases).toHaveLength(2);
        for (const { login, role } of cases) {
          // The second column catches scans that inspect only the first
          // attribute, and the separate schema catches public-only scans.
          await deployment.administrator.query(`CREATE SCHEMA elsewhere;
            CREATE VIEW elsewhere.evidence AS SELECT id, fingerprint AS sibling FROM registry_schema_fingerprint;
            GRANT USAGE ON SCHEMA elsewhere TO ${escapeIdentifier(role)};
            GRANT SELECT (sibling) ON elsewhere.evidence TO ${escapeIdentifier(role)}`);
          const runtime = deployment.connect(login, `-c role=${role}`);
          expect(
            (await runtime.query('SELECT current_user AS role')).rows,
          ).toEqual([{ role }]);
          expect(
            (await runtime.query('SELECT sibling FROM elsewhere.evidence'))
              .rows,
          ).toEqual([{ sibling: fingerprint }]);
          await expect(
            migrator.migrate(
              deployment.owner,
              [initial],
              fingerprint,
              deployment.allowedLogins,
            ),
          ).rejects.toThrow('access outside their reviewed Registry roles');
          expect(
            (
              await deployment.administrator.query(
                'SELECT * FROM registry_migrations.history',
              )
            ).rows,
          ).toEqual(history);
          await deployment.administrator.query('DROP SCHEMA elsewhere CASCADE');
          expect(
            await migrator.migrate(
              deployment.owner,
              [initial],
              fingerprint,
              deployment.allowedLogins,
            ),
          ).toEqual([]);
        }
      });
    });

    it('repairs registry backup evidence writes and delegation without provisioning read access', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        await deployment.administrator.query(
          runtimeRolesSql([roles.backup], 'Registry'),
        );
        const backupLogin = `registry_backup_login_${randomUUID().replaceAll('-', '')}`;
        await deployment.administrator.query(
          `CREATE ROLE ${escapeIdentifier(backupLogin)} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '${password}'`,
        );
        deployment.allowedLogins.push(backupLogin);
        await deployment.administrator
          .query(`GRANT ${escapeIdentifier(roles.backup)} TO ${escapeIdentifier(backupLogin)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
          GRANT CONNECT ON DATABASE ${escapeIdentifier(deployment.databaseName)} TO ${escapeIdentifier(backupLogin)}`);
        const migrator = createPostgresMigrator(deployment.config);
        const initial = artifact(roles);
        await migrator.migrate(
          deployment.owner,
          [initial],
          fingerprint,
          deployment.allowedLogins,
        );
        const tables = [
          'registry_migrations.history',
          'public.registry_schema_fingerprint',
        ];
        expect(tables).toHaveLength(2);
        for (const table of tables) {
          expect(
            (
              await deployment.administrator.query(
                "SELECT has_table_privilege($1, $2, 'SELECT') AS readable",
                [roles.backup, table],
              )
            ).rows,
          ).toEqual([{ readable: false }]);
        }
        await deployment.administrator
          .query(`GRANT USAGE ON SCHEMA public, registry_migrations TO ${escapeIdentifier(roles.backup)};
          GRANT SELECT ON registry_migrations.history, public.registry_schema_fingerprint TO ${escapeIdentifier(roles.backup)}`);
        const history = (
          await deployment.administrator.query(
            'SELECT * FROM registry_migrations.history',
          )
        ).rows;
        const stamp = (
          await deployment.administrator.query(
            'SELECT * FROM registry_schema_fingerprint',
          )
        ).rows;
        expect(history).toHaveLength(1);
        expect(stamp).toHaveLength(1);
        const backup = deployment.connect(
          backupLogin,
          `-c role=${roles.backup}`,
        );
        expect(
          (await backup.query('SELECT current_user AS role')).rows,
        ).toEqual([{ role: roles.backup }]);
        await backup.query('RESET ROLE');
        expect(
          (await backup.query('SELECT current_user AS role')).rows,
        ).toEqual([{ role: roles.backup }]);
        for (const repair of [false, true]) {
          if (repair) {
            await deployment.administrator
              .query(`GRANT USAGE ON SCHEMA registry_migrations TO ${escapeIdentifier(roles.backup)} WITH GRANT OPTION;
              GRANT ALL ON registry_migrations.history, registry_schema_fingerprint TO ${escapeIdentifier(roles.backup)} WITH GRANT OPTION;
              GRANT UPDATE (checksum), SELECT (checksum) ON registry_migrations.history TO ${escapeIdentifier(roles.backup)} WITH GRANT OPTION;
              GRANT UPDATE (fingerprint), SELECT (fingerprint) ON registry_schema_fingerprint TO ${escapeIdentifier(roles.backup)} WITH GRANT OPTION`);
          }
          expect(
            await migrator.migrate(
              deployment.owner,
              [initial],
              fingerprint,
              deployment.allowedLogins,
            ),
          ).toEqual([]);
          expect(
            (await backup.query('SELECT * FROM registry_migrations.history'))
              .rows,
          ).toEqual(history);
          expect(
            (await backup.query('SELECT * FROM registry_schema_fingerprint'))
              .rows,
          ).toEqual(stamp);
          for (const table of tables) {
            expect(
              (
                await backup.query(
                  `SELECT
              has_table_privilege(current_user, $1, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') AS writes,
              has_any_column_privilege(current_user, $1, 'INSERT,UPDATE,REFERENCES') AS column_writes,
              has_table_privilege(current_user, $1, 'SELECT WITH GRANT OPTION') AS delegate_reads,
              has_any_column_privilege(current_user, $1, 'SELECT WITH GRANT OPTION') AS delegate_column_reads`,
                  [table],
                )
              ).rows,
            ).toEqual([
              {
                writes: false,
                column_writes: false,
                delegate_reads: false,
                delegate_column_reads: false,
              },
            ]);
          }
          expect(
            (
              await backup.query(
                "SELECT has_schema_privilege(current_user, 'registry_migrations', 'USAGE WITH GRANT OPTION') AS delegate_usage",
              )
            ).rows,
          ).toEqual([{ delegate_usage: false }]);
          for (const sql of [
            "UPDATE registry_migrations.history SET checksum = 'forged'",
            'DELETE FROM registry_migrations.history',
            'TRUNCATE registry_migrations.history',
            "INSERT INTO registry_migrations.history(position, id, checksum, fingerprint) VALUES (100, 'forged', 'forged', 'forged')",
            "UPDATE registry_schema_fingerprint SET fingerprint = 'forged'",
            'DELETE FROM registry_schema_fingerprint',
            'TRUNCATE registry_schema_fingerprint',
            "INSERT INTO registry_schema_fingerprint(fingerprint) VALUES ('forged')",
          ])
            await expect(backup.query(sql)).rejects.toMatchObject({
              code: '42501',
            });
        }
      });
    });

    it('refuses configured backup writes before migration evidence exists', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        const migrator = createPostgresMigrator(deployment.config);
        await deployment.administrator.query(
          runtimeRolesSql([roles.backup], 'Registry'),
        );
        await deployment.administrator.query(`CREATE SCHEMA elsewhere;
          CREATE TABLE elsewhere.history (id integer PRIMARY KEY, sibling boolean);
          INSERT INTO elsewhere.history VALUES (1, false);
          GRANT USAGE ON SCHEMA elsewhere TO ${escapeIdentifier(roles.backup)};
          GRANT SELECT, UPDATE ON elsewhere.history TO ${escapeIdentifier(roles.backup)}`);
        expect(
          (
            await deployment.administrator.query(
              "SELECT to_regclass('registry_migrations.history') AS history, to_regclass('public.registry_schema_fingerprint') AS fingerprint",
            )
          ).rows,
        ).toEqual([{ history: null, fingerprint: null }]);
        const preflight = await deployment.owner.connect();
        try {
          await preflight.query('BEGIN');
          // Check before authored DDL creates the evidence tables: a final
          // check alone can mask a NULL-sensitive exclusion during preflight.
          await expect(
            migrator.enforceSecurity(preflight, deployment.allowedLogins),
          ).rejects.toThrow('access outside their reviewed Registry roles');
        } finally {
          await preflight.query('ROLLBACK');
          preflight.release();
        }
        await expect(
          migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).rejects.toThrow('access outside their reviewed Registry roles');
        expect(
          (
            await deployment.administrator.query(
              'SELECT * FROM elsewhere.history',
            )
          ).rows,
        ).toEqual([{ id: 1, sibling: false }]);
        await deployment.administrator.query(
          `REVOKE UPDATE ON elsewhere.history FROM ${escapeIdentifier(roles.backup)}`,
        );
        expect(
          await migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual(['0001_registry']);
      });
    });

    it('refuses configured backup data and sequence writes while preserving reads', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        await deployment.administrator.query(
          runtimeRolesSql([roles.backup], 'Registry'),
        );
        const backupLogin = `registry_backup_login_${randomUUID().replaceAll('-', '')}`;
        await deployment.administrator.query(
          `CREATE ROLE ${escapeIdentifier(backupLogin)} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB NOREPLICATION PASSWORD '${password}'`,
        );
        deployment.allowedLogins.push(backupLogin);
        await deployment.administrator
          .query(`GRANT ${escapeIdentifier(roles.backup)} TO ${escapeIdentifier(backupLogin)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
          GRANT CONNECT ON DATABASE ${escapeIdentifier(deployment.databaseName)} TO ${escapeIdentifier(backupLogin)}`);
        const migrator = createPostgresMigrator(deployment.config);
        const initial = artifact(roles);
        await migrator.migrate(
          deployment.owner,
          [initial],
          fingerprint,
          deployment.allowedLogins,
        );
        await deployment.administrator
          .query(`INSERT INTO registry_items VALUES (1, 'original');
          CREATE SCHEMA elsewhere;
          CREATE SEQUENCE elsewhere.counter;
          GRANT USAGE ON SCHEMA public, elsewhere TO ${escapeIdentifier(roles.backup)};
          GRANT SELECT ON registry_items TO ${escapeIdentifier(roles.backup)};
          GRANT SELECT ON SEQUENCE elsewhere.counter TO ${escapeIdentifier(roles.backup)}`);
        const history = (
          await deployment.administrator.query(
            'SELECT * FROM registry_migrations.history',
          )
        ).rows;
        expect(history).toHaveLength(1);
        const backup = deployment.connect(
          backupLogin,
          `-c role=${roles.backup}`,
        );
        expect(
          (await backup.query('SELECT current_user AS role')).rows,
        ).toEqual([{ role: roles.backup }]);
        const cases = [
          { grant: 'UPDATE ON registry_items', write: true },
          { grant: 'UPDATE (value) ON registry_items', write: true },
          { grant: 'USAGE ON SEQUENCE elsewhere.counter', write: false },
          { grant: 'UPDATE ON SEQUENCE elsewhere.counter', write: false },
        ];
        expect(cases).toHaveLength(4);
        for (const fixture of cases) {
          await deployment.administrator.query(
            `GRANT ${fixture.grant} TO ${escapeIdentifier(roles.backup)}`,
          );
          if (fixture.write) {
            const writer = await backup.connect();
            try {
              await writer.query('BEGIN');
              expect(
                (
                  await writer.query(
                    "UPDATE registry_items SET value = 'changed by backup' WHERE id = 1 RETURNING value",
                  )
                ).rows,
              ).toEqual([{ value: 'changed by backup' }]);
            } finally {
              await writer.query('ROLLBACK');
              writer.release();
            }
          }
          await expect(
            migrator.migrate(
              deployment.owner,
              [initial],
              fingerprint,
              deployment.allowedLogins,
            ),
            fixture.grant,
          ).rejects.toThrow('access outside their reviewed Registry roles');
          expect(
            (
              await deployment.administrator.query(
                'SELECT * FROM registry_migrations.history',
              )
            ).rows,
          ).toEqual(history);
          await deployment.administrator.query(
            `REVOKE ${fixture.grant} FROM ${escapeIdentifier(roles.backup)}`,
          );
          expect(
            await migrator.migrate(
              deployment.owner,
              [initial],
              fingerprint,
              deployment.allowedLogins,
            ),
          ).toEqual([]);
        }
        expect(
          (await backup.query('SELECT * FROM registry_items')).rows,
        ).toEqual([{ id: 1, value: 'original' }]);
        expect(
          (await backup.query('SELECT last_value FROM elsewhere.counter')).rows,
        ).toEqual([{ last_value: '1' }]);
      });
    });

    it('refuses direct login grants in a separate schema without changing applied history', async () => {
      await withRegistryCluster(async (create, roles) => {
        const deployment = await create();
        const migrator = createPostgresMigrator(deployment.config);
        await migrator.migrate(
          deployment.owner,
          [artifact(roles)],
          fingerprint,
          deployment.allowedLogins,
        );
        const before = (
          await deployment.administrator.query(
            'SELECT * FROM registry_migrations.history',
          )
        ).rows;
        expect(before).toHaveLength(1);
        await deployment.administrator.query(
          `CREATE SCHEMA elsewhere; CREATE TABLE elsewhere.private_data (id integer); GRANT SELECT ON elsewhere.private_data TO ${escapeIdentifier(deployment.logins.app)}`,
        );
        await expect(
          migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).rejects.toThrow('access outside their reviewed Registry roles');
        expect(
          (
            await deployment.administrator.query(
              'SELECT * FROM registry_migrations.history',
            )
          ).rows,
        ).toEqual(before);
        await deployment.administrator.query('DROP SCHEMA elsewhere CASCADE');
        expect(
          await migrator.migrate(
            deployment.owner,
            [artifact(roles)],
            fingerprint,
            deployment.allowedLogins,
          ),
        ).toEqual([]);
      });
    });
  },
);
