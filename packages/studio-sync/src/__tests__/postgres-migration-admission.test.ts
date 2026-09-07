import { randomUUID } from 'node:crypto';

import { escapeIdentifier, escapeLiteral, type Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  jsonHash,
  sha256,
  type Migration,
} from '../postgres-migration-artifacts.ts';
import { createPostgresMigrator } from '../postgres-migrations.ts';
import {
  revokeLargeObjectPrivilegesSql,
  runtimeRolesSql,
} from '../role-bootstrap.ts';
import { closeFixturePool, fixturePool } from './support/pool-lifecycle.ts';
import { CI, PGPASSWORD, PGPORT, PGUSER } from './test-env.ts';

const suffix = randomUUID().replaceAll('-', '');
const database = `generic_admission_${suffix}`;
const role = {
  app: `generic_app_${suffix}`,
  operator: `generic_operator_${suffix}`,
  backup: `generic_backup_${suffix}`,
};
const login = {
  owner: `generic_owner_${suffix}`,
  app: `generic_runtime_${suffix}`,
  operator: `generic_operations_${suffix}`,
  backup: `generic_capture_${suffix}`,
  outside: `generic_outside_${suffix}`,
};
const allowedLogins = [login.owner, login.app, login.operator, login.backup];
const password = 'generic-admission-local-only';
const connection = {
  host: '127.0.0.1',
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: 'postgres',
  max: 1,
  connectionTimeoutMillis: 1500,
};
const administrator = fixturePool(connection);
let reachable = false;
try {
  await administrator.query('SELECT 1');
  reachable = true;
} catch {
  await closeFixturePool(administrator);
  if (CI)
    throw new Error('PostgreSQL is required for migration admission tests.');
}
const schemaName = 'custom"application';
const historySchema = 'custom-history';
const fingerprintTable = 'custom_fingerprint';
const qualifiedFingerprint = `${escapeIdentifier(schemaName)}.${escapeIdentifier(fingerprintTable)}`;
const qualifiedData = `${escapeIdentifier(schemaName)}.data`;
const fingerprint = sha256('generic schema');
const migrator = createPostgresMigrator({
  applicationName: 'Custom Registry',
  allowedLoginsSetting: 'CUSTOM_ALLOWED_LOGINS',
  runtimeRoles: [role.app, role.operator],
  runtimeLoginRoleSets: [[role.app], [role.operator]],
  backupRole: role.backup,
  schemaName,
  historySchema,
  fingerprintTable,
  lockKey: 4700521855394701,
  stampFingerprint: async (client, next) => {
    await client.query(
      `INSERT INTO ${qualifiedFingerprint} VALUES (true, $1) ON CONFLICT (id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint`,
      [next],
    );
  },
});
const sql = `CREATE SCHEMA ${escapeIdentifier(schemaName)};
CREATE TABLE ${qualifiedFingerprint} (id boolean PRIMARY KEY CHECK (id), fingerprint text NOT NULL);
CREATE TABLE ${qualifiedData} (id integer PRIMARY KEY, value integer NOT NULL);
INSERT INTO ${qualifiedData} VALUES (1, 0)`;
const sidecars = `GRANT USAGE ON SCHEMA ${escapeIdentifier(schemaName)} TO ${Object.values(role).map(escapeIdentifier).join(', ')};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${escapeIdentifier(schemaName)} TO ${[role.app, role.operator].map(escapeIdentifier).join(', ')};
GRANT SELECT ON ALL TABLES IN SCHEMA ${escapeIdentifier(schemaName)} TO ${escapeIdentifier(role.backup)}`;
const manifest = {
  format: 1 as const,
  id: '0001_custom',
  previous: null,
  fingerprint,
  snapshotHash: jsonHash({}),
  sqlHash: sha256(sql),
  sidecarsHash: sha256(sidecars),
};
const migrations: Migration[] = [
  { manifest, sql, sidecars, snapshot: {}, checksum: jsonHash(manifest) },
];

describe.skipIf(!reachable)('configured migration admission boundary', () => {
  let owner: Pool;
  let adminDatabase: Pool;
  beforeAll(async () => {
    await administrator.query(
      runtimeRolesSql(Object.values(role), 'Custom Registry'),
    );
    for (const name of Object.values(login))
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(name)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION PASSWORD ${escapeLiteral(password)}`,
      );
    for (const [member, parent] of [
      [login.app, role.app],
      [login.operator, role.operator],
      [login.backup, role.backup],
      [login.outside, role.app],
    ] as const)
      await administrator.query(
        `GRANT ${escapeIdentifier(parent)} TO ${escapeIdentifier(member)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
    await administrator.query(
      `CREATE DATABASE ${escapeIdentifier(database)} OWNER ${escapeIdentifier(login.owner)} ALLOW_CONNECTIONS false`,
    );
    await administrator.query(
      `REVOKE ALL ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC;
       GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${allowedLogins.map(escapeIdentifier).join(', ')};
       ALTER DATABASE ${escapeIdentifier(database)} ALLOW_CONNECTIONS true`,
    );
    owner = fixturePool({
      ...connection,
      user: login.owner,
      password,
      database,
    });
    adminDatabase = fixturePool({ ...connection, database });
    await adminDatabase.query(
      revokeLargeObjectPrivilegesSql([
        ...Object.values(role),
        ...Object.values(login),
      ]),
    );
    expect(
      await migrator.migrate(owner, migrations, fingerprint, allowedLogins),
    ).toEqual(['0001_custom']);
  });
  afterAll(async () => {
    await Promise.all([
      closeFixturePool(owner),
      closeFixturePool(adminDatabase),
    ]);
    await administrator.query(`DROP DATABASE ${escapeIdentifier(database)}`);
    await administrator.query(
      `DROP ROLE ${[...Object.values(login), ...Object.values(role)].map(escapeIdentifier).join(', ')}`,
    );
    await closeFixturePool(administrator);
  });

  it('preserves independent singleton role sets and quoted evidence names on a populated no-op', async () => {
    expect(
      await migrator.migrate(owner, migrations, fingerprint, allowedLogins),
    ).toEqual([]);
    for (const [user, intendedRole] of [
      [login.app, role.app],
      [login.operator, role.operator],
    ] as const) {
      const runtime = fixturePool({
        ...connection,
        user,
        password,
        database,
        options: `-c role=${intendedRole}`,
      });
      try {
        expect(
          (
            await runtime.query(
              `UPDATE ${qualifiedData} SET value = value + 1 RETURNING id`,
            )
          ).rows,
        ).toEqual([{ id: 1 }]);
        await expect(
          runtime.query(
            `UPDATE ${qualifiedFingerprint} SET fingerprint = 'forged'`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await closeFixturePool(runtime);
      }
    }
    expect(
      (await owner.query(`SELECT value FROM ${qualifiedData}`)).rows,
    ).toEqual([{ value: 2 }]);
  });

  it.each(['app', 'operator', 'backup'] as const)(
    'refuses actual %s column-level evidence writes before trusting history',
    async (identity) => {
      await owner.query(
        `GRANT UPDATE(fingerprint) ON ${qualifiedFingerprint} TO ${escapeIdentifier(role[identity])}`,
      );
      const runtime = fixturePool({
        ...connection,
        user: login[identity],
        password,
        database,
        options: `-c role=${role[identity]}`,
      });
      try {
        expect(
          (
            await runtime.query(
              `UPDATE ${qualifiedFingerprint} SET fingerprint = $1`,
              [fingerprint],
            )
          ).rowCount,
        ).toBe(1);
        await closeFixturePool(runtime);
        await expect(
          migrator.migrate(owner, migrations, fingerprint, allowedLogins),
        ).rejects.toThrow('migration evidence is writable');
      } finally {
        if (!runtime.ended) await closeFixturePool(runtime);
        await owner.query(
          `REVOKE UPDATE(fingerprint) ON ${qualifiedFingerprint} FROM ${escapeIdentifier(role[identity])}`,
        );
      }
    },
  );

  it.each(['app', 'operator', 'backup'] as const)(
    'refuses actual direct data writes by enrolled %s login on a populated no-op',
    async (identity) => {
      await owner.query(`GRANT USAGE ON SCHEMA ${escapeIdentifier(schemaName)} TO ${escapeIdentifier(login[identity])};
        GRANT UPDATE(value) ON ${qualifiedData} TO ${escapeIdentifier(login[identity])}`);
      const runtime = fixturePool({
        ...connection,
        user: login[identity],
        password,
        database,
        options: `-c role=${role[identity]}`,
      });
      try {
        await runtime.query('SET ROLE NONE');
        expect(
          (await runtime.query(`UPDATE ${qualifiedData} SET value = 17`))
            .rowCount,
        ).toBe(1);
        await expect(
          migrator.migrate(owner, migrations, fingerprint, allowedLogins),
        ).rejects.toThrow(
          'hold no access outside their reviewed Custom Registry roles',
        );
      } finally {
        await closeFixturePool(runtime);
        await owner.query(`REVOKE UPDATE(value) ON ${qualifiedData} FROM ${escapeIdentifier(login[identity])};
          REVOKE USAGE ON SCHEMA ${escapeIdentifier(schemaName)} FROM ${escapeIdentifier(login[identity])}`);
      }
    },
  );

  it('refuses owner-backed automatic view updates with readonly evidence ACLs', async () => {
    const view = `${escapeIdentifier(schemaName)}.owner_evidence_view`;
    await owner.query(`CREATE VIEW ${view} AS SELECT fingerprint FROM ${qualifiedFingerprint};
      GRANT UPDATE(fingerprint) ON ${view} TO ${escapeIdentifier(role.app)}`);
    const runtime = fixturePool({
      ...connection,
      user: login.app,
      password,
      database,
      options: `-c role=${role.app}`,
    });
    try {
      expect(
        (
          await runtime.query(`UPDATE ${view} SET fingerprint = $1`, [
            fingerprint,
          ])
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await runtime.query(
            'SELECT has_any_column_privilege(current_user, $1, $2) AS writable',
            [qualifiedFingerprint, 'UPDATE'],
          )
        ).rows,
      ).toEqual([{ writable: false }]);
      await expect(
        migrator.migrate(owner, migrations, fingerprint, allowedLogins),
      ).rejects.toThrow('view');
    } finally {
      await closeFixturePool(runtime);
      await owner.query(`DROP VIEW ${view}`);
    }
  });

  it('refuses a connected outside login with a shared runtime role and custom enrollment name', async () => {
    await owner.query(
      `GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(login.outside)}`,
    );
    const outside = fixturePool({
      ...connection,
      user: login.outside,
      password,
      database,
      options: `-c role=${role.app}`,
    });
    try {
      expect(
        (
          await outside.query(
            `UPDATE ${qualifiedData} SET value = value + 1 RETURNING id`,
          )
        ).rows,
      ).toEqual([{ id: 1 }]);
      await expect(
        migrator.migrate(owner, migrations, fingerprint, allowedLogins),
      ).rejects.toThrow('CUSTOM_ALLOWED_LOGINS');
    } finally {
      await closeFixturePool(outside);
      await owner.query(
        `REVOKE CONNECT ON DATABASE ${escapeIdentifier(database)} FROM ${escapeIdentifier(login.outside)}`,
      );
    }
  });
});
