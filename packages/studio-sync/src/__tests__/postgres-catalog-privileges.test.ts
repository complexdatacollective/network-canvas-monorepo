import { randomUUID } from 'node:crypto';

import { escapeIdentifier, Pool, type PoolClient } from 'pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { assertSafePostgresCatalogPrivileges } from '../postgres-catalog-privileges.ts';
import { CI, PGPASSWORD, PGPORT, PGUSER } from './test-env.ts';

const UNSAFE = 'POSTGRES_CATALOG_PRIVILEGES_UNSAFE';
const INVALID = 'POSTGRES_CATALOG_PRIVILEGES_INVALID';
const suffix = randomUUID().replaceAll('-', '');
const database = `catalog_boundary_${suffix}`;
const roles = {
  runtime: `catalog_app_${suffix}`,
  backup: `catalog_backup_${suffix}`,
  login: `catalog_login_${suffix}`,
  inherited: `catalog_inherited_${suffix}`,
};
const identities = [roles.runtime, roles.backup, roles.login];
const connection = {
  host: '127.0.0.1',
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: 'postgres',
  max: 1,
  connectionTimeoutMillis: 1500,
};
const administrator = new Pool(connection);
let reachable = false;
try {
  await administrator.query('SELECT 1');
  reachable = true;
} catch {
  await administrator.end();
  if (CI) throw new Error('PostgreSQL is required for catalog boundary tests.');
}

/** PostgreSQL enforces the actual restricted identity's privileges here;
 * the original administrator identity only restores the savepoint. */
async function asIdentity<T>(
  client: PoolClient,
  identity: string,
  action: () => Promise<T>,
): Promise<T> {
  await client.query('SAVEPOINT restricted_identity');
  try {
    await client.query(
      `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(identity)}`,
    );
    return await action();
  } finally {
    await client.query(
      'ROLLBACK TO SAVEPOINT restricted_identity; RELEASE SAVEPOINT restricted_identity',
    );
  }
}

describe.skipIf(!reachable)('PostgreSQL catalog privilege boundary', () => {
  let pool: Pool;
  let client: PoolClient;

  beforeAll(async () => {
    await administrator.query(
      `CREATE DATABASE ${escapeIdentifier(database)} TEMPLATE template0`,
    );
    pool = new Pool({ ...connection, database });
  });
  afterAll(async () => {
    await pool.end();
    await administrator.query(`DROP DATABASE ${escapeIdentifier(database)}`);
    await administrator.end();
  });
  beforeEach(async () => {
    client = await pool.connect();
    await client.query('BEGIN');
    // Unique role creation and every hostile global grant are transactional.
    for (const role of Object.values(roles)) {
      await client.query(
        `CREATE ROLE ${escapeIdentifier(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`,
      );
    }
    await client.query(
      `ALTER ROLE ${escapeIdentifier(roles.login)} LOGIN PASSWORD 'synthetic-catalog-fixture-only'`,
    );
    // Production callers must deny database TEMP independently. PostgreSQL
    // synthesizes current-temp namespace CREATE from that database privilege.
    await client.query(
      `REVOKE TEMPORARY ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC, ${Object.values(roles).map(escapeIdentifier).join(', ')}`,
    );
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await client.query('ROLLBACK');
    client.release();
  });

  it('preserves stock lower(), catalog and all stock public information_schema reads for runtime, backup and login identities', async () => {
    const version = (
      await client.query<{ version: number }>(
        "SELECT current_setting('server_version_num')::integer AS version",
      )
    ).rows[0]!.version;
    expect(Math.floor(version / 10000)).toBe(18);
    const inventory = (
      await client.query<{
        name: string;
        kind: string;
        oid: number;
        initial: string | null;
      }>(
        `SELECT relation.relname AS name, relation.relkind AS kind, relation.oid,
        initial.privtype AS initial
      FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace
      LEFT JOIN pg_init_privs initial ON initial.classoid='pg_class'::regclass
        AND initial.objoid=relation.oid AND initial.objsubid=0
      WHERE namespace.nspname='information_schema'
        AND EXISTS(SELECT 1 FROM aclexplode(relation.relacl) privilege
          WHERE privilege.grantee=0 AND privilege.privilege_type='SELECT')
      ORDER BY relation.relname`,
      )
    ).rows;
    // This independent pristine database inventory detects omitted stock names.
    expect(inventory).toHaveLength(62);
    expect(
      inventory.every(
        ({ oid, initial, kind }) =>
          oid < 16384 && initial === null && ['r', 'v'].includes(kind),
      ),
    ).toBe(true);
    const handlers = (
      await client.query<{
        stock: boolean;
        name: string;
        initial: string | null;
      }>(
        `SELECT routine.oid < 16384 AS stock, routine.proname AS name, initial.privtype AS initial
      FROM pg_proc routine JOIN pg_depend dependency ON dependency.objid=routine.oid
        AND dependency.classid='pg_proc'::regclass AND dependency.deptype='e'
      JOIN pg_extension extension ON extension.oid=dependency.refobjid AND extension.extname='plpgsql'
      LEFT JOIN pg_init_privs initial ON initial.classoid='pg_proc'::regclass
        AND initial.objoid=routine.oid AND initial.objsubid=0 ORDER BY routine.proname`,
      )
    ).rows;
    expect(handlers).toEqual([
      { stock: true, name: 'plpgsql_call_handler', initial: null },
      { stock: true, name: 'plpgsql_inline_handler', initial: null },
      { stock: true, name: 'plpgsql_validator', initial: null },
    ]);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).resolves.toBeUndefined();
    for (const identity of identities) {
      await asIdentity(client, identity, async () => {
        expect(
          (await client.query("SELECT lower('FiXtUrE') AS value")).rows,
        ).toEqual([{ value: 'fixture' }]);
        expect(
          (
            await client.query(
              "SELECT relname FROM pg_catalog.pg_class WHERE oid='pg_catalog.pg_authid'::regclass",
            )
          ).rows,
        ).toEqual([{ relname: 'pg_authid' }]);
        for (const { name } of inventory) {
          const read = await client.query(
            `SELECT * FROM information_schema.${escapeIdentifier(name)} LIMIT 1`,
          );
          expect(read.command).toBe('SELECT');
          expect(read.fields.length).toBeGreaterThan(0);
        }
        await expect(
          assertSafePostgresCatalogPrivileges(client, identities),
        ).resolves.toBeUndefined();
      });
    }
  });

  it('preserves only the stock pg_settings SET interface and its parameter permission checks', async () => {
    for (const identity of [roles.runtime, roles.backup]) {
      await asIdentity(client, identity, async () => {
        await client.query("SET LOCAL work_mem='4MB'");
        expect(
          (await client.query("SELECT current_setting('work_mem') AS value"))
            .rows,
        ).toEqual([{ value: '4MB' }]);
        await client.query(
          "UPDATE pg_catalog.pg_settings SET setting='8192' WHERE name='work_mem'",
        );
        expect(
          (await client.query("SELECT current_setting('work_mem') AS value"))
            .rows,
        ).toEqual([{ value: '8MB' }]);
        await expect(
          assertSafePostgresCatalogPrivileges(client, identities),
        ).resolves.toBeUndefined();
      });
      for (const [parameter, value] of [
        ['lo_compat_privileges', 'on'],
        ['session_replication_role', 'replica'],
      ]) {
        await expect(
          asIdentity(client, identity, async () => {
            expect(
              (
                await client.query(
                  "SELECT has_parameter_privilege(current_user, $1, 'SET') AS allowed",
                  [parameter],
                )
              ).rows,
            ).toEqual([{ allowed: false }]);
            await client.query(
              'UPDATE pg_catalog.pg_settings SET setting=$1 WHERE name=$2',
              [value, parameter],
            );
          }),
        ).rejects.toMatchObject({ code: '42501' });
      }
    }
  });

  it.each(
    (['pg_catalog', 'information_schema'] as const).flatMap((namespace) =>
      (['runtime', 'backup', 'login', 'inherited', 'PUBLIC'] as const).map(
        (principal) => ({ namespace, principal }),
      ),
    ),
  )(
    'refuses $principal CREATE on $namespace before a harmful object must exist',
    async ({ namespace, principal }) => {
      const grantee =
        principal === 'PUBLIC' ? 'PUBLIC' : escapeIdentifier(roles[principal]);
      const identity =
        principal === 'PUBLIC' || principal === 'inherited'
          ? roles.runtime
          : roles[principal];
      if (principal === 'inherited') {
        await client.query(
          `GRANT ${escapeIdentifier(roles.inherited)} TO ${escapeIdentifier(roles.runtime)} WITH INHERIT TRUE, SET FALSE`,
        );
      }
      await client.query(`GRANT CREATE ON SCHEMA ${namespace} TO ${grantee}`);
      // Observe the decision before creation. The capability is usable even
      // while every existing routine and relation still has its stock grants.
      const decision = await assertSafePostgresCatalogPrivileges(
        client,
        identities,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await asIdentity(client, identity, async () => {
        await client.query(
          `CREATE FUNCTION ${namespace}.catalog_namespace_probe() RETURNS boolean LANGUAGE sql AS 'SELECT true'`,
        );
        expect(
          (
            await client.query(
              `SELECT ${namespace}.catalog_namespace_probe() AS reached`,
            )
          ).rows,
        ).toEqual([{ reached: true }]);
      });
      expect(decision).toEqual(new Error(UNSAFE));
    },
  );

  it.each(
    (['pg_catalog', 'information_schema'] as const).flatMap((namespace) =>
      (['runtime', 'backup', 'login', 'inherited'] as const).map(
        (principal) => ({ namespace, principal }),
      ),
    ),
  )(
    'refuses $principal USAGE grant delegation on $namespace',
    async ({ namespace, principal }) => {
      const identity =
        principal === 'inherited' ? roles.runtime : roles[principal];
      const recipient = `catalog_delegate_${suffix}`;
      await client.query(`CREATE ROLE ${escapeIdentifier(recipient)} NOLOGIN`);
      if (principal === 'inherited') {
        await client.query(
          `GRANT ${escapeIdentifier(roles.inherited)} TO ${escapeIdentifier(roles.runtime)} WITH INHERIT TRUE, SET FALSE`,
        );
      }
      await client.query(
        `GRANT USAGE ON SCHEMA ${namespace} TO ${escapeIdentifier(roles[principal])} WITH GRANT OPTION`,
      );
      const decision = await assertSafePostgresCatalogPrivileges(
        client,
        identities,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await asIdentity(client, identity, async () => {
        await client.query(
          `GRANT USAGE ON SCHEMA ${namespace} TO ${escapeIdentifier(recipient)}`,
        );
        expect(
          (
            await client.query(
              `SELECT EXISTS (
        SELECT 1 FROM pg_namespace namespace, aclexplode(namespace.nspacl) privilege
        WHERE namespace.nspname=$1 AND privilege.privilege_type='USAGE'
          AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=$2)
          AND privilege.grantor=(SELECT oid FROM pg_roles WHERE rolname=$3)
      ) AS delegated`,
              [namespace, recipient, roles[principal]],
            )
          ).rows,
        ).toEqual([{ delegated: true }]);
      });
      expect(decision).toEqual(new Error(UNSAFE));
    },
  );

  it.each(['pg_catalog', 'information_schema'] as const)(
    'refuses restricted ownership of %s even after direct CREATE is revoked',
    async (namespace) => {
      await client.query(
        `ALTER SCHEMA ${namespace} OWNER TO ${escapeIdentifier(roles.runtime)}; REVOKE ALL ON SCHEMA ${namespace} FROM ${escapeIdentifier(roles.runtime)}`,
      );
      expect(
        (
          await client.query(
            "SELECT has_schema_privilege($1, $2, 'CREATE') AS create",
            [roles.runtime, namespace],
          )
        ).rows,
      ).toEqual([{ create: false }]);
      const decision = await assertSafePostgresCatalogPrivileges(
        client,
        identities,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await asIdentity(client, roles.runtime, async () => {
        await client.query(`GRANT CREATE ON SCHEMA ${namespace} TO ${escapeIdentifier(roles.runtime)};
          CREATE FUNCTION ${namespace}.catalog_namespace_probe() RETURNS boolean LANGUAGE sql AS 'SELECT true'`);
        expect(
          (
            await client.query(
              `SELECT ${namespace}.catalog_namespace_probe() AS reached`,
            )
          ).rows,
        ).toEqual([{ reached: true }]);
      });
      expect(decision).toEqual(new Error(UNSAFE));
    },
  );

  it.each(['table', 'column'] as const)(
    'refuses pg_settings UPDATE grant options at %s level',
    async (kind) => {
      const privilege = kind === 'table' ? 'UPDATE' : 'UPDATE(setting)';
      await client.query(
        `GRANT ${privilege} ON pg_catalog.pg_settings TO ${escapeIdentifier(roles.runtime)} WITH GRANT OPTION`,
      );
      const acl =
        kind === 'table'
          ? "SELECT relacl AS acl FROM pg_class WHERE oid='pg_catalog.pg_settings'::regclass"
          : "SELECT attacl AS acl FROM pg_attribute WHERE attrelid='pg_catalog.pg_settings'::regclass AND attname='setting'";
      await asIdentity(client, roles.runtime, async () => {
        await client.query(
          `GRANT ${privilege} ON pg_catalog.pg_settings TO ${escapeIdentifier(roles.backup)}`,
        );
        expect(
          (
            await client.query(
              `SELECT EXISTS (
      SELECT 1 FROM (${acl}) source, aclexplode(source.acl) privilege
      WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)
        AND privilege.grantor=(SELECT oid FROM pg_roles WHERE rolname=$2)
    ) AS delegated`,
              [roles.backup, roles.runtime],
            )
          ).rows,
        ).toEqual([{ delegated: true }]);
      });
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toThrow(UNSAFE);
    },
  );

  it.each([
    ['file', 'runtime'],
    ['file', 'backup'],
    ['file', 'login'],
    ['file', 'inherited'],
    ['file', 'PUBLIC'],
    ['table', 'runtime'],
    ['table', 'backup'],
    ['table', 'login'],
    ['table', 'inherited'],
    ['table', 'PUBLIC'],
    ['column', 'runtime'],
    ['column', 'backup'],
    ['column', 'login'],
    ['column', 'inherited'],
    ['column', 'PUBLIC'],
  ] as const)(
    'refuses actual %s access granted to %s',
    async (capability, principal) => {
      const target =
        principal === 'PUBLIC' ? 'PUBLIC' : escapeIdentifier(roles[principal]);
      const identity =
        principal === 'PUBLIC' || principal === 'inherited'
          ? roles.runtime
          : roles[principal];
      if (principal === 'inherited') {
        await client.query(
          `GRANT ${escapeIdentifier(roles.inherited)} TO ${escapeIdentifier(roles.runtime)} WITH INHERIT TRUE, SET FALSE`,
        );
      }
      const execute = async () =>
        capability === 'file'
          ? client.query(
              "SELECT length(pg_catalog.pg_read_file('PG_VERSION', 0, 64)) > 0 AS reached",
            )
          : client.query(
              'SELECT rolpassword IS NOT NULL AS reached FROM pg_catalog.pg_authid WHERE rolname=$1',
              [roles.login],
            );
      await expect(asIdentity(client, identity, execute)).rejects.toMatchObject(
        { code: '42501' },
      );
      await client.query(
        capability === 'file'
          ? `GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text,bigint,bigint) TO ${target}`
          : capability === 'table'
            ? `GRANT SELECT ON pg_catalog.pg_authid TO ${target}`
            : `GRANT SELECT(rolname,rolpassword) ON pg_catalog.pg_authid TO ${target}`,
      );
      expect((await asIdentity(client, identity, execute)).rows).toEqual([
        { reached: true },
      ]);
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toThrow(UNSAFE);
    },
  );

  it.each([
    '_pg_foreign_data_wrappers',
    '_pg_foreign_servers',
    '_pg_foreign_table_columns',
    '_pg_foreign_tables',
    '_pg_user_mappings',
    'sql_parts',
    'transforms',
  ])(
    'keeps ungranted stock information_schema.%s outside the SELECT baseline',
    async (name) => {
      const target = `information_schema.${escapeIdentifier(name)}`;
      await expect(
        asIdentity(client, roles.runtime, () =>
          client.query(`SELECT * FROM ${target}`),
        ),
      ).rejects.toMatchObject({ code: '42501' });
      await client.query(
        `GRANT SELECT ON ${target} TO ${escapeIdentifier(roles.runtime)}`,
      );
      expect(
        (
          await asIdentity(client, roles.runtime, () =>
            client.query(`SELECT * FROM ${target}`),
          )
        ).command,
      ).toBe('SELECT');
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toThrow(UNSAFE);
    },
  );

  it.each(['table', 'column', 'routine'] as const)(
    'refuses %s grant options even when ordinary stock reads are permitted',
    async (kind) => {
      const target = escapeIdentifier(roles.backup);
      await client.query(
        kind === 'routine'
          ? `GRANT EXECUTE ON FUNCTION pg_catalog.lower(text) TO ${target} WITH GRANT OPTION`
          : kind === 'table'
            ? `GRANT SELECT ON pg_catalog.pg_class TO ${target} WITH GRANT OPTION`
            : `GRANT SELECT(relname) ON pg_catalog.pg_class TO ${target} WITH GRANT OPTION`,
      );
      const acl =
        kind === 'routine'
          ? "SELECT proacl AS acl FROM pg_proc WHERE oid='pg_catalog.lower(text)'::regprocedure"
          : kind === 'table'
            ? "SELECT relacl AS acl FROM pg_class WHERE oid='pg_catalog.pg_class'::regclass"
            : "SELECT attacl AS acl FROM pg_attribute WHERE attrelid='pg_catalog.pg_class'::regclass AND attname='relname'";
      await asIdentity(client, roles.backup, async () => {
        await client.query(
          kind === 'routine'
            ? `GRANT EXECUTE ON FUNCTION pg_catalog.lower(text) TO ${escapeIdentifier(roles.login)}`
            : kind === 'table'
              ? `GRANT SELECT ON pg_catalog.pg_class TO ${escapeIdentifier(roles.login)}`
              : `GRANT SELECT(relname) ON pg_catalog.pg_class TO ${escapeIdentifier(roles.login)}`,
        );
        expect(
          (
            await client.query(
              `SELECT EXISTS (
      SELECT 1 FROM (${acl}) source, aclexplode(source.acl) privilege
      WHERE privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)
        AND privilege.grantor=(SELECT oid FROM pg_roles WHERE rolname=$2)
    ) AS delegated`,
              [roles.login, roles.backup],
            )
          ).rows,
        ).toEqual([{ delegated: true }]);
      });
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toThrow(UNSAFE);
    },
  );

  it('refuses actual catalog column writes without relying on an unrelated read refusal', async () => {
    await client.query(
      'CREATE TABLE public.catalog_write_target(value integer)',
    );
    const before = (
      await client.query(
        "SELECT relpages FROM pg_catalog.pg_class WHERE oid='public.catalog_write_target'::regclass",
      )
    ).rows;
    expect(before).toEqual([{ relpages: 0 }]);
    await client.query(
      `GRANT UPDATE(relpages) ON pg_catalog.pg_class TO ${escapeIdentifier(roles.runtime)}`,
    );
    expect(
      (
        await asIdentity(client, roles.runtime, () =>
          client.query(
            "UPDATE pg_catalog.pg_class SET relpages=7 WHERE oid='public.catalog_write_target'::regclass RETURNING relpages",
          ),
        )
      ).rows,
    ).toEqual([{ relpages: 7 }]);
    expect(
      (
        await client.query(
          "SELECT relpages FROM pg_catalog.pg_class WHERE oid='public.catalog_write_target'::regclass",
        )
      ).rows,
    ).toEqual(before);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
  });

  it('refuses actual protected catalog system-column reads', async () => {
    const read = () =>
      client.query(
        'SELECT ctid IS NOT NULL AS reached FROM pg_catalog.pg_authid LIMIT 1',
      );
    await expect(asIdentity(client, roles.runtime, read)).rejects.toMatchObject(
      { code: '42501' },
    );
    await client.query(
      `GRANT SELECT(ctid) ON pg_catalog.pg_authid TO ${escapeIdentifier(roles.runtime)}`,
    );
    expect((await asIdentity(client, roles.runtime, read)).rows).toEqual([
      { reached: true },
    ]);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
  });

  it('refuses actual stock catalog system-column grant delegation', async () => {
    await client.query(
      `GRANT SELECT(ctid) ON pg_catalog.pg_class TO ${escapeIdentifier(roles.backup)} WITH GRANT OPTION`,
    );
    await asIdentity(client, roles.backup, async () => {
      await client.query(
        `GRANT SELECT(ctid) ON pg_catalog.pg_class TO ${escapeIdentifier(roles.runtime)}`,
      );
      expect(
        (
          await client.query(
            `SELECT EXISTS (
        SELECT 1 FROM pg_attribute attribute, aclexplode(attribute.attacl) privilege
        WHERE attribute.attrelid='pg_class'::regclass AND attribute.attnum=-1
          AND privilege.grantee=(SELECT oid FROM pg_roles WHERE rolname=$1)
          AND privilege.grantor=(SELECT oid FROM pg_roles WHERE rolname=$2)
      ) AS delegated`,
            [roles.runtime, roles.backup],
          )
        ).rows,
      ).toEqual([{ delegated: true }]);
    });
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
  });

  it('refuses actual information_schema table writes without relying on an unrelated read refusal', async () => {
    const before = (
      await client.query<{
        feature_id: string;
        sub_feature_id: string;
        feature_name: string;
      }>(
        'SELECT feature_id, sub_feature_id, feature_name FROM information_schema.sql_features ORDER BY feature_id, sub_feature_id LIMIT 1',
      )
    ).rows;
    expect(before).toHaveLength(1);
    const { feature_id: feature, sub_feature_id: subFeature } = before[0]!;
    await client.query(
      `GRANT UPDATE ON information_schema.sql_features TO ${escapeIdentifier(roles.runtime)}`,
    );
    expect(
      (
        await asIdentity(client, roles.runtime, () =>
          client.query(
            "UPDATE information_schema.sql_features SET feature_name='catalog write proof' WHERE feature_id=$1 AND sub_feature_id=$2 RETURNING feature_name",
            [feature, subFeature],
          ),
        )
      ).rows,
    ).toEqual([{ feature_name: 'catalog write proof' }]);
    expect(
      (
        await client.query(
          'SELECT feature_id, sub_feature_id, feature_name FROM information_schema.sql_features WHERE feature_id=$1 AND sub_feature_id=$2',
          [feature, subFeature],
        )
      ).rows,
    ).toEqual(before);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
  });

  it.each([true, false])(
    'refuses unknown system SECURITY DEFINER presence with EXECUTE available %s',
    async (executable) => {
      await client.query(
        `CREATE FUNCTION pg_catalog.catalog_boundary_definer() RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT true'`,
      );
      expect(
        (
          await client.query(
            "SELECT oid >= 16384 AS unknown, proacl IS NULL AS default_acl FROM pg_proc WHERE oid='pg_catalog.catalog_boundary_definer()'::regprocedure",
          )
        ).rows,
      ).toEqual([{ unknown: true, default_acl: true }]);
      expect(
        (
          await asIdentity(client, roles.runtime, () =>
            client.query(
              'SELECT pg_catalog.catalog_boundary_definer() AS reached',
            ),
          )
        ).rows,
      ).toEqual([{ reached: true }]);
      if (!executable) {
        await client.query(
          'REVOKE ALL ON FUNCTION pg_catalog.catalog_boundary_definer() FROM PUBLIC',
        );
        await expect(
          asIdentity(client, roles.runtime, () =>
            client.query('SELECT pg_catalog.catalog_boundary_definer()'),
          ),
        ).rejects.toMatchObject({ code: '42501' });
      }
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toThrow(UNSAFE);
    },
  );

  it('refuses unknown default-PUBLIC system invoker routines and accepts them after complete revocation', async () => {
    await client.query(
      `CREATE FUNCTION pg_catalog.catalog_boundary_invoker() RETURNS boolean LANGUAGE sql AS 'SELECT true'`,
    );
    expect(
      (
        await asIdentity(client, roles.backup, () =>
          client.query(
            'SELECT pg_catalog.catalog_boundary_invoker() AS reached',
          ),
        )
      ).rows,
    ).toEqual([{ reached: true }]);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
    await client.query(
      'REVOKE ALL ON FUNCTION pg_catalog.catalog_boundary_invoker() FROM PUBLIC',
    );
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).resolves.toBeUndefined();
  });

  it('refuses unknown information_schema lookalikes despite their stock names and kinds', async () => {
    await client.query(
      'ALTER VIEW information_schema.tables RENAME TO original_tables; REVOKE ALL ON information_schema.original_tables FROM PUBLIC; CREATE VIEW information_schema.tables AS SELECT true AS reached; GRANT SELECT ON information_schema.tables TO PUBLIC',
    );
    expect(
      (
        await client.query(
          "SELECT oid >= 16384 AS unknown FROM pg_class WHERE oid='information_schema.tables'::regclass",
        )
      ).rows,
    ).toEqual([{ unknown: true }]);
    expect(
      (
        await asIdentity(client, roles.runtime, () =>
          client.query('SELECT * FROM information_schema.tables'),
        )
      ).rows,
    ).toEqual([{ reached: true }]);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
  });

  it('does not trust an extension initial PUBLIC EXECUTE baseline', async () => {
    await client.query(`CREATE FUNCTION pg_catalog.catalog_boundary_extension() RETURNS boolean LANGUAGE sql AS 'SELECT true';
      GRANT EXECUTE ON FUNCTION pg_catalog.catalog_boundary_extension() TO PUBLIC;
      ALTER EXTENSION plpgsql ADD FUNCTION pg_catalog.catalog_boundary_extension()`);
    expect(
      (
        await client.query(`SELECT initial.privtype, EXISTS (
      SELECT 1 FROM aclexplode(initial.initprivs) privilege
      WHERE privilege.grantee=0 AND privilege.privilege_type='EXECUTE'
    ) AS initial_public FROM pg_init_privs initial
    WHERE initial.classoid='pg_proc'::regclass
      AND initial.objoid='pg_catalog.catalog_boundary_extension()'::regprocedure`)
      ).rows,
    ).toEqual([{ privtype: 'e', initial_public: true }]);
    expect(
      (
        await asIdentity(client, roles.backup, () =>
          client.query(
            'SELECT pg_catalog.catalog_boundary_extension() AS reached',
          ),
        )
      ).rows,
    ).toEqual([{ reached: true }]);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
    await client.query(
      'REVOKE ALL ON FUNCTION pg_catalog.catalog_boundary_extension() FROM PUBLIC',
    );
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).resolves.toBeUndefined();
  });

  it.each(['table', 'column'] as const)(
    'does not trust an extension initial PUBLIC %s SELECT baseline',
    async (kind) => {
      await client.query(`CREATE TABLE information_schema.catalog_boundary_extension (value integer);
      INSERT INTO information_schema.catalog_boundary_extension VALUES (1);
      GRANT SELECT${kind === 'column' ? '(value)' : ''} ON information_schema.catalog_boundary_extension TO PUBLIC;
      ALTER EXTENSION plpgsql ADD TABLE information_schema.catalog_boundary_extension`);
      expect(
        (
          await client.query(
            `SELECT initial.privtype, initial.objsubid, EXISTS (
      SELECT 1 FROM aclexplode(initial.initprivs) privilege
      WHERE privilege.grantee=0 AND privilege.privilege_type='SELECT'
    ) AS initial_public FROM pg_init_privs initial
    WHERE initial.classoid='pg_class'::regclass
      AND initial.objoid='information_schema.catalog_boundary_extension'::regclass
      AND initial.objsubid=$1`,
            [kind === 'column' ? 1 : 0],
          )
        ).rows,
      ).toEqual([
        {
          privtype: 'e',
          objsubid: kind === 'column' ? 1 : 0,
          initial_public: true,
        },
      ]);
      expect(
        (
          await asIdentity(client, roles.runtime, () =>
            client.query(
              'SELECT value FROM information_schema.catalog_boundary_extension',
            ),
          )
        ).rows,
      ).toEqual([{ value: 1 }]);
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toThrow(UNSAFE);
      await client.query(
        'REVOKE ALL ON information_schema.catalog_boundary_extension FROM PUBLIC; REVOKE SELECT(value) ON information_schema.catalog_boundary_extension FROM PUBLIC',
      );
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).resolves.toBeUndefined();
    },
  );

  it('does not retain the information_schema exception after a stock view becomes an extension member', async () => {
    await client.query(
      'ALTER EXTENSION plpgsql ADD VIEW information_schema.tables',
    );
    expect(
      (
        await client.query(`SELECT relation.oid < 16384 AS stock_oid, initial.privtype
      FROM pg_class relation JOIN pg_init_privs initial
        ON initial.classoid='pg_class'::regclass AND initial.objoid=relation.oid AND initial.objsubid=0
      WHERE relation.oid='information_schema.tables'::regclass`)
      ).rows,
    ).toEqual([{ stock_oid: true, privtype: 'e' }]);
    expect(
      (
        await asIdentity(client, roles.runtime, () =>
          client.query('SELECT * FROM information_schema.tables LIMIT 1'),
        )
      ).command,
    ).toBe('SELECT');
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
    await client.query(
      'ALTER EXTENSION plpgsql DROP VIEW information_schema.tables',
    );
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).resolves.toBeUndefined();
  });

  it('does not treat unrelated temporary relations as stock or ignore their effective grants', async () => {
    await client.query(
      'CREATE TEMP TABLE catalog_boundary_temporary (value integer); INSERT INTO catalog_boundary_temporary VALUES (1)',
    );
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).resolves.toBeUndefined();
    await client.query(
      `GRANT SELECT ON catalog_boundary_temporary TO ${escapeIdentifier(roles.backup)}`,
    );
    expect(
      (
        await asIdentity(client, roles.backup, () =>
          client.query('SELECT * FROM pg_temp.catalog_boundary_temporary'),
        )
      ).rows,
    ).toEqual([{ value: 1 }]);
    await expect(
      assertSafePostgresCatalogPrivileges(client, identities),
    ).rejects.toThrow(UNSAFE);
  });

  it.each(['runtime', 'backup', 'login', 'inherited', 'PUBLIC'] as const)(
    'refuses %s database TEMP through the actual current temporary namespace',
    async (principal) => {
      await client.query('CREATE TEMP TABLE administrator_temp(value integer)');
      const identity =
        principal === 'inherited' || principal === 'PUBLIC'
          ? roles.runtime
          : roles[principal];
      const grantee =
        principal === 'PUBLIC' ? 'PUBLIC' : escapeIdentifier(roles[principal]);
      if (principal === 'inherited') {
        await client.query(
          `GRANT ${escapeIdentifier(roles.inherited)} TO ${escapeIdentifier(roles.runtime)} WITH INHERIT TRUE, SET FALSE`,
        );
      }
      expect(
        (
          await client.query(
            "SELECT pg_my_temp_schema() <> 0 AS initialized, has_schema_privilege($1, pg_my_temp_schema(), 'CREATE') AS can_create",
            [identity],
          )
        ).rows,
      ).toEqual([{ initialized: true, can_create: false }]);
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).resolves.toBeUndefined();
      await client.query(
        `GRANT TEMPORARY ON DATABASE ${escapeIdentifier(database)} TO ${grantee}`,
      );
      const decision = await assertSafePostgresCatalogPrivileges(
        client,
        identities,
      ).then(
        () => null,
        (error: unknown) => error,
      );
      await asIdentity(client, identity, async () => {
        await client.query(
          'CREATE TEMP TABLE restricted_temp(value integer); INSERT INTO restricted_temp VALUES(1)',
        );
        expect(
          (await client.query('SELECT value FROM restricted_temp')).rows,
        ).toEqual([{ value: 1 }]);
      });
      expect(decision).toEqual(new Error(UNSAFE));
    },
  );

  it('rejects absent identities instead of passing an empty catalog scan', async () => {
    await expect(
      assertSafePostgresCatalogPrivileges(client, ['missing_catalog_identity']),
    ).rejects.toThrow(UNSAFE);
  });

  it.each(['SELECT', 'USAGE', 'UPDATE'] as const)(
    'refuses actual temporary sequence %s access',
    async (privilege) => {
      await client.query('CREATE TEMP SEQUENCE catalog_boundary_sequence');
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).resolves.toBeUndefined();
      await client.query(
        `GRANT ${privilege} ON SEQUENCE pg_temp.catalog_boundary_sequence TO ${escapeIdentifier(roles.backup)}`,
      );
      expect(
        (
          await asIdentity(client, roles.backup, () =>
            client.query(
              privilege === 'SELECT'
                ? 'SELECT last_value::integer AS value FROM pg_temp.catalog_boundary_sequence'
                : privilege === 'USAGE'
                  ? "SELECT nextval('pg_temp.catalog_boundary_sequence')::integer AS value"
                  : "SELECT setval('pg_temp.catalog_boundary_sequence', 7)::integer AS value",
            ),
          )
        ).rows,
      ).toEqual([{ value: privilege === 'UPDATE' ? 7 : 1 }]);
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toThrow(UNSAFE);
    },
  );

  it('preserves quoted Unicode identity names and checks their actual privileges', async () => {
    const identity = `catalog_"Ω_${suffix}`;
    await client.query(`CREATE ROLE ${escapeIdentifier(identity)} NOLOGIN`);
    await expect(
      assertSafePostgresCatalogPrivileges(client, [identity]),
    ).resolves.toBeUndefined();
    await client.query(
      `GRANT EXECUTE ON FUNCTION pg_catalog.pg_read_file(text,bigint,bigint) TO ${escapeIdentifier(identity)}`,
    );
    expect(
      (
        await asIdentity(client, identity, () =>
          client.query(
            "SELECT length(pg_catalog.pg_read_file('PG_VERSION', 0, 64)) > 0 AS reached",
          ),
        )
      ).rows,
    ).toEqual([{ reached: true }]);
    await expect(
      assertSafePostgresCatalogPrivileges(client, [identity]),
    ).rejects.toThrow(UNSAFE);
  });

  it.each(
    [
      null,
      undefined,
      4,
      {},
      [],
      [''],
      ['duplicate', 'duplicate'],
      [4],
      ['bad\0name'],
      ['bad\ud800'],
      ['a'.repeat(64)],
    ].map((invalid) => ({ invalid })),
  )(
    'rejects untyped invalid identity input with a fixed error before querying: $invalid',
    async ({ invalid }) => {
      const query = vi.spyOn(client, 'query');
      await expect(
        assertSafePostgresCatalogPrivileges(
          client,
          invalid as readonly string[],
        ),
      ).rejects.toThrow(INVALID);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('copies identities before awaiting PostgreSQL', async () => {
    await client.query(
      `GRANT SELECT ON pg_catalog.pg_authid TO ${escapeIdentifier(roles.backup)}`,
    );
    const mutable = [roles.runtime, roles.backup];
    // Queue verification behind an already active real query. pg serializes
    // queued parameters later, so passing the caller's mutable array is observable.
    const preceding = client.query('SELECT 1');
    const verification = assertSafePostgresCatalogPrivileges(client, mutable);
    mutable.splice(0, 2, roles.runtime);
    await preceding;
    await expect(verification).rejects.toThrow(UNSAFE);
    await expect(
      assertSafePostgresCatalogPrivileges(client, mutable),
    ).resolves.toBeUndefined();
  });

  it('redacts database errors even when a caller cannot read required metadata', async () => {
    await client.query('REVOKE SELECT ON pg_catalog.pg_init_privs FROM PUBLIC');
    await asIdentity(client, roles.runtime, async () => {
      await expect(
        assertSafePostgresCatalogPrivileges(client, identities),
      ).rejects.toEqual(new Error(UNSAFE));
    });
  });
});
