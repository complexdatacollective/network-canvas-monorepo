import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import pg, { escapeIdentifier, escapeLiteral } from 'pg';
import { expect, it } from 'vitest';

import {
  createPostgresBackupVerifier,
  type PostgresBackupConfiguration,
} from '../postgres-backup.ts';
import { createPostgresPool } from '../postgres-pool.ts';
import {
  RESTRICTED_LARGE_OBJECT_FUNCTIONS,
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
} from '../role-bootstrap.ts';
import { PGPORT } from './test-env.ts';

const configuration: PostgresBackupConfiguration = {
  role: 'registry_backup',
  completeSchemas: ['registry_data', 'registry_history'],
  expectedTables: [
    { schema: 'registry_data', name: 'entries' },
    { schema: 'registry_history', name: 'history' },
  ],
  rowSecurity: { mode: 'forbid' },
  failureCode: 'REGISTRY_BACKUP_ACCESS_UNSAFE',
};

it.each([
  { role: '' },
  { role: 'é'.repeat(32) },
  { role: 'bad\0role' },
  { role: 'bad\udfffrole' },
  { completeSchemas: [] },
  { completeSchemas: ['registry_data', 'registry_data'] },
  { completeSchemas: ['registry_data'] },
  { expectedTables: [] },
  { expectedTables: [{ schema: 'registry_data', name: '' }] },
  { expectedTables: [{ schema: 'registry_data', name: 'x'.repeat(64) }] },
  {
    expectedTables: [
      configuration.expectedTables[0]!,
      configuration.expectedTables[0]!,
    ],
  },
  { rowSecurity: { mode: 'policy', name: '', expression: 'true' } },
  { rowSecurity: { mode: 'policy', name: 'backup_read', expression: '' } },
  { rowSecurity: { mode: 'policy', name: 'backup_read', expression: 'x\0' } },
  { failureCode: 'provider secret' },
  { failureCode: 'REGISTRY_ERROR\n' },
] satisfies Partial<PostgresBackupConfiguration>[])(
  'rejects incomplete configuration before a database can be supplied: %j',
  (invalid) => {
    expect(() =>
      createPostgresBackupVerifier({ ...configuration, ...invalid }),
    ).toThrow('Supply complete PostgreSQL backup verification configuration.');
  },
);

async function fixture() {
  const suffix = randomUUID().replaceAll('-', '');
  const databaseName = `backup_contract_${suffix}`;
  const role = `registry_backup_${suffix}`;
  const login = `registry_capture_${suffix}`;
  const password = `synthetic-backup-${suffix}`;
  const admin = new pg.Pool({
    host: '127.0.0.1',
    port: PGPORT,
    user: 'postgres',
    password: 'spike',
    database: 'postgres',
    max: 1,
  });
  const owner = new pg.Pool({
    host: '127.0.0.1',
    port: PGPORT,
    user: 'postgres',
    password: 'spike',
    database: databaseName,
    max: 1,
  });
  const url = new URL(`postgres://127.0.0.1:${PGPORT}/${databaseName}`);
  url.username = login;
  url.password = password;
  const openBackup = () =>
    createPostgresPool({
      connectionString: url.toString(),
      role,
      max: 1,
      onIdleError: () => {
        throw new Error('BACKUP_FIXTURE_IDLE_FAILURE');
      },
    });
  const backup = openBackup();
  const dataSchema = 'registry"data';
  const historySchema = 'registry-history';
  const entryName = 'entry"record';
  const table = `${escapeIdentifier(dataSchema)}.${escapeIdentifier(entryName)}`;
  const history = `${escapeIdentifier(historySchema)}.history`;
  const config = {
    ...configuration,
    role,
    completeSchemas: [dataSchema, historySchema],
    expectedTables: [
      { schema: dataSchema, name: entryName },
      { schema: historySchema, name: 'history' },
    ],
  };
  const verify = createPostgresBackupVerifier(config);
  const dispose = async () => {
    await Promise.all([backup.end(), owner.end()]);
    try {
      const deadline = Date.now() + 2000;
      while (
        (
          await admin.query<{ count: number }>(
            'SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1',
            [databaseName],
          )
        ).rows[0]?.count !== 0
      ) {
        if (Date.now() >= deadline)
          throw new Error('BACKUP_FIXTURE_CONNECTION_LEAK');
        await setTimeout(5);
      }
      await admin.query(
        `DROP DATABASE IF EXISTS ${escapeIdentifier(databaseName)}`,
      );
      await admin.query(
        `DROP ROLE IF EXISTS ${escapeIdentifier(login)}, ${escapeIdentifier(role)}`,
      );
    } finally {
      await admin.end();
    }
  };
  try {
    await admin.query(runtimeRolesSql([role]));
    await admin.query(`CREATE ROLE ${escapeIdentifier(login)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD ${escapeLiteral(password)};
      GRANT ${escapeIdentifier(role)} TO ${escapeIdentifier(login)} WITH INHERIT FALSE, SET TRUE`);
    await admin.query(`CREATE DATABASE ${escapeIdentifier(databaseName)}`);
    await owner.query(revokeLargeObjectPrivilegesSql([role, login]));
    await owner.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      CREATE SCHEMA ${escapeIdentifier(dataSchema)};
      CREATE SCHEMA ${escapeIdentifier(historySchema)};
      CREATE TABLE ${table}(id integer PRIMARY KEY, body text);
      INSERT INTO ${table} VALUES (1, 'first'), (2, 'second');
      CREATE TABLE ${history}(id text PRIMARY KEY);
      INSERT INTO ${history} VALUES ('0001');
      GRANT USAGE ON SCHEMA ${escapeIdentifier(dataSchema)}, ${escapeIdentifier(historySchema)} TO ${escapeIdentifier(role)};
      GRANT SELECT ON ${table}, ${history} TO ${escapeIdentifier(role)}`);
  } catch (error) {
    await dispose();
    throw error;
  }
  return {
    owner,
    backup,
    login,
    role,
    dataSchema,
    historySchema,
    table,
    history,
    databaseName,
    openBackup,
    config,
    verify,
    dispose,
  };
}

/** GLOBAL parameter grants are visible only inside this administrator-owned
 * transaction. The queries still run with a real nonadministrative identity. */
async function asBackup(
  f: Awaited<ReturnType<typeof fixture>>,
  prepare: (client: pg.PoolClient) => Promise<unknown>,
  work: (client: pg.PoolClient) => Promise<void>,
) {
  const client = await f.owner.connect();
  try {
    await client.query('BEGIN');
    await prepare(client);
    await client.query(
      `SET LOCAL SESSION AUTHORIZATION ${escapeIdentifier(f.login)}; SET LOCAL ROLE ${escapeIdentifier(f.role)}`,
    );
    expect(
      (await client.query('SELECT current_user AS role, session_user AS login'))
        .rows,
    ).toEqual([{ role: f.role, login: f.login }]);
    await work(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

const principals = ['role', 'login', 'PUBLIC'] as const;

it.each(
  RESTRICTED_LARGE_OBJECT_FUNCTIONS.flatMap((routine) =>
    principals.map((principal) => ({ routine, principal })),
  ),
)(
  'refuses $principal execution of $routine before an object exists',
  async ({ routine, principal }) => {
    const f = await fixture();
    try {
      await expect(f.verify(f.backup)).resolves.toBeUndefined();
      const grantee =
        principal === 'PUBLIC' ? 'PUBLIC' : escapeIdentifier(f[principal]);
      await asBackup(
        f,
        (client) =>
          client.query(`GRANT EXECUTE ON FUNCTION ${routine} TO ${grantee}`),
        async (client) => {
          expect(
            (
              await client.query<{ allowed: boolean }>(
                "SELECT has_function_privilege(current_user, $1::regprocedure, 'EXECUTE') OR has_function_privilege(session_user, $1::regprocedure, 'EXECUTE') AS allowed",
                [routine],
              )
            ).rows,
          ).toEqual([{ allowed: true }]);
          const creation = new Map([
            ['pg_catalog.lo_create(oid)', 'SELECT lo_create(0) AS id'],
            ['pg_catalog.lo_creat(integer)', 'SELECT lo_creat(-1) AS id'],
            [
              'pg_catalog.lo_from_bytea(oid,bytea)',
              "SELECT lo_from_bytea(0, decode('616263', 'hex')) AS id",
            ],
          ]).get(routine);
          if (creation) {
            if (principal === 'login')
              await client.query('SET LOCAL ROLE NONE');
            const object = (await client.query<{ id: number }>(creation))
              .rows[0];
            expect(object?.id).toBeGreaterThan(0);
            expect(
              (
                await client.query<{ removed: number }>(
                  'SELECT lo_unlink($1) AS removed',
                  [object!.id],
                )
              ).rows,
            ).toEqual([{ removed: 1 }]);
            if (principal === 'login')
              await client.query(`SET LOCAL ROLE ${escapeIdentifier(f.role)}`);
          }
          expect(
            (
              await client.query(
                'SELECT count(*)::int AS count FROM pg_largeobject_metadata',
              )
            ).rows,
          ).toEqual([{ count: 0 }]);
          await expect(f.verify(client)).rejects.toThrow(
            configuration.failureCode,
          );
        },
      );
      await expect(f.verify(f.backup)).resolves.toBeUndefined();
    } finally {
      await f.dispose();
    }
  },
);

it.each(principals)(
  'refuses $principal SET on replication mode with an empty object inventory',
  async (principal) => {
    const f = await fixture();
    try {
      await expect(f.verify(f.backup)).resolves.toBeUndefined();
      const grantee =
        principal === 'PUBLIC' ? 'PUBLIC' : escapeIdentifier(f[principal]);
      await asBackup(
        f,
        (client) =>
          client.query(
            `GRANT SET ON PARAMETER session_replication_role TO ${grantee}`,
          ),
        async (client) => {
          if (principal === 'login') await client.query('SET LOCAL ROLE NONE');
          await client.query("SET LOCAL session_replication_role = 'replica'");
          expect(
            (
              await client.query(
                "SELECT current_setting('session_replication_role') AS mode",
              )
            ).rows,
          ).toEqual([{ mode: 'replica' }]);
          await client.query("SET LOCAL session_replication_role = 'origin'");
          if (principal === 'login')
            await client.query(`SET LOCAL ROLE ${escapeIdentifier(f.role)}`);
          // The live mode is safe now; the remaining grant alone must refuse.
          await expect(f.verify(client)).rejects.toThrow(
            configuration.failureCode,
          );
        },
      );
      await expect(f.verify(f.backup)).resolves.toBeUndefined();
    } finally {
      await f.dispose();
    }
  },
);

it('refuses a permissive live replication mode after SET is no longer available', async () => {
  const f = await fixture();
  try {
    await expect(f.verify(f.backup)).resolves.toBeUndefined();
    await asBackup(
      f,
      (client) =>
        client.query("SET LOCAL session_replication_role = 'replica'"),
      async (client) => {
        expect(
          (
            await client.query(
              "SELECT has_parameter_privilege(current_user, 'session_replication_role', 'SET') OR has_parameter_privilege(session_user, 'session_replication_role', 'SET') AS allowed",
            )
          ).rows,
        ).toEqual([{ allowed: false }]);
        await expect(f.verify(client)).rejects.toThrow(
          configuration.failureCode,
        );
      },
    );
    await expect(f.verify(f.backup)).resolves.toBeUndefined();
  } finally {
    await f.dispose();
  }
});

const modes = [
  { parameter: 'lo_compat_privileges', unsafe: 'on', safe: 'off' },
  { parameter: 'session_replication_role', unsafe: 'replica', safe: 'origin' },
] as const;

it.each(
  modes.flatMap((mode) =>
    ['role', 'login', 'role-database', 'login-database', 'database'].map(
      (scope) => ({ ...mode, scope }),
    ),
  ),
)(
  'refuses persisted $scope $parameter while the verifier connection is safe',
  async ({ parameter, unsafe, safe, scope }) => {
    const f = await fixture();
    let warm: pg.PoolClient | undefined;
    try {
      warm = await f.backup.connect();
      await expect(f.verify(warm)).resolves.toBeUndefined();
      const role = scope.startsWith('login') ? f.login : f.role;
      const command =
        scope === 'database'
          ? `ALTER DATABASE ${escapeIdentifier(f.databaseName)}`
          : `ALTER ROLE ${escapeIdentifier(role)}${scope.endsWith('-database') ? ` IN DATABASE ${escapeIdentifier(f.databaseName)}` : ''}`;
      // The setting is restricted to this suite's unique role/database. A fresh
      // pg_dump session applies it even though an existing pooled verifier does not.
      await f.owner.query(
        `${command} SET ${parameter} = ${escapeLiteral(unsafe)}`,
      );
      expect(
        (await warm.query('SELECT current_setting($1) AS mode', [parameter]))
          .rows,
      ).toEqual([{ mode: safe }]);
      if (scope.startsWith('login') || scope === 'database') {
        const fresh = f.openBackup();
        try {
          expect(
            (
              await fresh.query('SELECT current_setting($1) AS mode', [
                parameter,
              ])
            ).rows,
          ).toEqual([{ mode: unsafe }]);
          if (parameter === 'lo_compat_privileges') {
            const object = (
              await f.owner.query<{ id: number }>(
                "SELECT lo_from_bytea(0, decode('616263', 'hex')) AS id",
              )
            ).rows[0]!;
            expect(
              (
                await fresh.query(
                  'SELECT lomowner = current_user::regrole AS owned, lomacl IS NULL AS no_grants FROM pg_largeobject_metadata WHERE oid = $1',
                  [object.id],
                )
              ).rows,
            ).toEqual([{ owned: false, no_grants: true }]);
            await expect(
              warm.query('SELECT lo_get($1)', [object.id]),
            ).rejects.toMatchObject({ code: '42501' });
            expect(
              (
                await fresh.query("SELECT encode(lo_get($1), 'hex') AS bytes", [
                  object.id,
                ])
              ).rows,
            ).toEqual([{ bytes: '616263' }]);
            await f.owner.query('SELECT lo_unlink($1)', [object.id]);
          }
        } finally {
          await fresh.end();
        }
      }
      await expect(f.verify(warm)).rejects.toThrow(configuration.failureCode);
      await f.owner.query(`${command} RESET ${parameter}`);
      await expect(f.verify(warm)).resolves.toBeUndefined();
    } finally {
      warm?.release();
      await f.dispose();
    }
  },
);

it('accepts safe and unrelated-database defaults without weakening active-database checks', async () => {
  const f = await fixture();
  try {
    for (const { parameter, safe, unsafe } of modes) {
      await f.owner
        .query(`ALTER DATABASE ${escapeIdentifier(f.databaseName)} SET ${parameter} = ${escapeLiteral(safe)};
        ALTER ROLE ${escapeIdentifier(f.login)} IN DATABASE postgres SET ${parameter} = ${escapeLiteral(unsafe)}`);
    }
    await expect(f.verify(f.backup)).resolves.toBeUndefined();
  } finally {
    await f.dispose();
  }
});

it.each(modes)(
  'refuses a shadowed unsafe $parameter default even when fresh connections are safe',
  async ({ parameter, unsafe, safe }) => {
    const f = await fixture();
    try {
      await f.owner
        .query(`ALTER ROLE ${escapeIdentifier(f.login)} SET ${parameter} = ${escapeLiteral(unsafe)};
      ALTER ROLE ${escapeIdentifier(f.login)} IN DATABASE ${escapeIdentifier(f.databaseName)} SET ${parameter} = ${escapeLiteral(safe)}`);
      const fresh = f.openBackup();
      try {
        expect(
          (await fresh.query('SELECT current_setting($1) AS mode', [parameter]))
            .rows,
        ).toEqual([{ mode: safe }]);
        await expect(f.verify(fresh)).rejects.toThrow(
          configuration.failureCode,
        );
      } finally {
        await fresh.end();
      }
      await f.owner.query(
        `ALTER ROLE ${escapeIdentifier(f.login)} RESET ${parameter}`,
      );
      await expect(f.verify(f.backup)).resolves.toBeUndefined();
    } finally {
      await f.dispose();
    }
  },
);

it('checks a separate registry role and quoted inventory, including future tables and sequences', async () => {
  const f = await fixture();
  try {
    await expect(f.verify(f.backup)).resolves.toBeUndefined();
    expect(
      (await f.backup.query(`SELECT body FROM ${f.table} ORDER BY id`)).rows,
    ).toEqual([{ body: 'first' }, { body: 'second' }]);
    const future = `${escapeIdentifier(f.historySchema)}.future`;
    await f.owner.query(
      `CREATE TABLE ${future}(id integer); INSERT INTO ${future} VALUES (42)`,
    );
    await expect(f.verify(f.backup)).rejects.toThrow(configuration.failureCode);
    await f.owner.query(
      `GRANT SELECT ON ${future} TO ${escapeIdentifier(f.role)}`,
    );
    await expect(f.verify(f.backup)).resolves.toBeUndefined();
    const sequence = `${escapeIdentifier(f.historySchema)}.counter`;
    await f.owner.query(`CREATE SEQUENCE ${sequence}`);
    await expect(f.verify(f.backup)).rejects.toThrow(configuration.failureCode);
    await f.owner.query(
      `GRANT SELECT ON SEQUENCE ${sequence} TO ${escapeIdentifier(f.role)}`,
    );
    await expect(f.verify(f.backup)).resolves.toBeUndefined();
    await f.owner.query(`DROP TABLE ${f.history}`);
    await expect(f.verify(f.backup)).rejects.toThrow(configuration.failureCode);
  } finally {
    await f.dispose();
  }
});

it('keeps caller-owned policy semantics exact and refuses every RLS table for a registry without RLS', async () => {
  const f = await fixture();
  try {
    const policyName = 'registry"read';
    const expression = `(CURRENT_USER = ${escapeLiteral(f.role)}::name)`;
    await f.owner.query(`ALTER TABLE ${f.table} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY ${escapeIdentifier(policyName)} ON ${f.table} FOR SELECT TO PUBLIC USING (${expression})`);
    expect(
      (await f.backup.query(`SELECT id FROM ${f.table} ORDER BY id`)).rows,
    ).toEqual([{ id: 1 }, { id: 2 }]);
    await expect(f.verify(f.backup)).rejects.toThrow(configuration.failureCode);
    const policyConfig = {
      ...f.config,
      rowSecurity: { mode: 'policy' as const, name: policyName, expression },
    };
    const policyVerifier = createPostgresBackupVerifier(policyConfig);
    await expect(policyVerifier(f.backup)).resolves.toBeUndefined();
    await expect(
      createPostgresBackupVerifier({
        ...policyConfig,
        rowSecurity: { ...policyConfig.rowSecurity, expression: 'true' },
      })(f.backup),
    ).rejects.toThrow(configuration.failureCode);
    await expect(
      createPostgresBackupVerifier({
        ...policyConfig,
        rowSecurity: { ...policyConfig.rowSecurity, name: 'wrong_policy' },
      })(f.backup),
    ).rejects.toThrow(configuration.failureCode);
    await f.owner.query(
      `CREATE POLICY clipped ON ${f.table} AS RESTRICTIVE FOR SELECT TO PUBLIC USING (id = 1)`,
    );
    expect((await f.backup.query(`SELECT id FROM ${f.table}`)).rows).toEqual([
      { id: 1 },
    ]);
    await expect(policyVerifier(f.backup)).rejects.toThrow(
      configuration.failureCode,
    );
  } finally {
    await f.dispose();
  }
});

it('snapshots mutable configuration before asynchronous database access', async () => {
  const f = await fixture();
  try {
    f.config.completeSchemas.pop();
    f.config.expectedTables.pop();
    await f.owner.query(
      `CREATE TABLE ${escapeIdentifier(f.historySchema)}.future(id integer)`,
    );
    await expect(f.verify(f.backup)).rejects.toThrow(configuration.failureCode);
    await f.owner.query(
      `DROP TABLE ${escapeIdentifier(f.historySchema)}.future; DROP TABLE ${f.history}`,
    );
    await expect(f.verify(f.backup)).rejects.toThrow(configuration.failureCode);
  } finally {
    await f.dispose();
  }
});
