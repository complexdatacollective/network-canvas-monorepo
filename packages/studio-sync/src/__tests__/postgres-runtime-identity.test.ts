import { randomUUID } from 'node:crypto';

import { escapeIdentifier, Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertSafePostgresRuntimeIdentity } from '../postgres-runtime-identity.ts';
import { revokeLargeObjectPrivilegesSql } from '../role-bootstrap.ts';
import { CI, PGPASSWORD, PGPORT, PGUSER } from './test-env.ts';

const suffix = randomUUID().replaceAll('-', '');
const database = `runtime_identity_${suffix}`;
const password = 'synthetic-runtime-identity-only';
const roles = {
  app: `runtime_app_${suffix}`,
  maintenance: `runtime_maintenance_${suffix}`,
  login: `runtime_login_${suffix}`,
  owner: `runtime_owner_${suffix}`,
  outside: `runtime_outside_${suffix}`,
};
const allowedRoles = [roles.app, roles.maintenance];
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
  if (CI) throw new Error('PostgreSQL is required for runtime identity tests.');
}

function runtimePool(login: string, intendedRole: string): Pool {
  return new Pool({
    ...connection,
    database,
    user: login,
    password,
    options: `-c role=${intendedRole}`,
  });
}

async function withClient<T>(
  pool: Pool,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
    await pool.end();
  }
}

describe.skipIf(!reachable)('PostgreSQL runtime identity boundary', () => {
  let databaseAdmin: Pool;

  beforeAll(async () => {
    for (const role of Object.values(roles)) {
      await administrator.query(
        `CREATE ROLE ${escapeIdentifier(role)} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION`,
      );
    }
    for (const login of [roles.login, roles.owner]) {
      await administrator.query(
        `ALTER ROLE ${escapeIdentifier(login)} LOGIN PASSWORD '${password}'`,
      );
      await administrator.query(
        `GRANT ${allowedRoles.map(escapeIdentifier).join(', ')} TO ${escapeIdentifier(login)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
    }
    await administrator.query(
      `CREATE DATABASE ${escapeIdentifier(database)} OWNER ${escapeIdentifier(roles.owner)} TEMPLATE template0`,
    );
    databaseAdmin = new Pool({ ...connection, database });
    await databaseAdmin.query(
      `REVOKE CONNECT, TEMPORARY ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC, ${allowedRoles.map(escapeIdentifier).join(', ')};
       GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(roles.login)};
       ${revokeLargeObjectPrivilegesSql()}`,
    );
  });

  afterAll(async () => {
    await databaseAdmin.end();
    await administrator.query(
      `DROP DATABASE ${escapeIdentifier(database)} WITH (FORCE)`,
    );
    await administrator.query(
      `DROP ROLE ${Object.values(roles).map(escapeIdentifier).join(', ')}`,
    );
    await administrator.end();
  });

  it.each([roles.app, roles.maintenance])(
    'accepts a dedicated login pinned to reviewed role %s',
    async (intendedRole) => {
      await withClient(
        runtimePool(roles.login, intendedRole),
        async (client) => {
          await expect(
            assertSafePostgresRuntimeIdentity(client, {
              intendedRole,
              allowedRoles,
            }),
          ).resolves.toBeUndefined();
        },
      );
    },
  );

  it('copies and validates configuration before its first database await', async () => {
    await withClient(runtimePool(roles.login, roles.app), async (client) => {
      const mutable = [...allowedRoles];
      const verification = assertSafePostgresRuntimeIdentity(client, {
        intendedRole: roles.app,
        allowedRoles: mutable,
      });
      mutable.splice(0, mutable.length, roles.outside);
      await expect(verification).resolves.toBeUndefined();
      await expect(
        assertSafePostgresRuntimeIdentity(client, {
          intendedRole: roles.app,
          allowedRoles: [roles.app, roles.app],
        }),
      ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_INVALID');
    });
  });

  it('rejects a database owner even when that login has the valid runtime memberships', async () => {
    await withClient(runtimePool(roles.owner, roles.app), async (client) => {
      await expect(
        assertSafePostgresRuntimeIdentity(client, {
          intendedRole: roles.app,
          allowedRoles,
        }),
      ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
    });
  });

  it('requires the login membership set to be exactly the reviewed SET-only roles', async () => {
    await databaseAdmin.query(
      `GRANT ${escapeIdentifier(roles.outside)} TO ${escapeIdentifier(roles.login)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
    );
    try {
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
          }),
        ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
      });
    } finally {
      await databaseAdmin.query(
        `REVOKE ${escapeIdentifier(roles.outside)} FROM ${escapeIdentifier(roles.login)}`,
      );
    }
  });

  it('rejects an outside login that can inherit CONNECT and SET through the runtime login', async () => {
    await databaseAdmin.query(
      `ALTER ROLE ${escapeIdentifier(roles.outside)} LOGIN INHERIT PASSWORD '${password}';
       GRANT ${escapeIdentifier(roles.login)} TO ${escapeIdentifier(roles.outside)} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE;
       CREATE TABLE runtime_membership_chain (id integer PRIMARY KEY);
       GRANT INSERT ON runtime_membership_chain TO ${escapeIdentifier(roles.app)}`,
    );
    try {
      await withClient(
        runtimePool(roles.outside, roles.app),
        async (client) => {
          expect(
            (
              await client.query(
                'INSERT INTO runtime_membership_chain VALUES (1)',
              )
            ).rowCount,
          ).toBe(1);
        },
      );
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
          }),
        ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
      });
    } finally {
      await databaseAdmin.query(
        `DROP TABLE runtime_membership_chain;
         REVOKE ${escapeIdentifier(roles.login)} FROM ${escapeIdentifier(roles.outside)};
         ALTER ROLE ${escapeIdentifier(roles.outside)} NOLOGIN NOINHERIT`,
      );
    }
  });

  it('rejects direct data access held by the connecting login', async () => {
    await databaseAdmin.query(
      `CREATE TABLE runtime_direct_access (id integer);
       GRANT SELECT ON runtime_direct_access TO ${escapeIdentifier(roles.login)}`,
    );
    try {
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await client.query('SET ROLE NONE');
        await expect(
          client.query('SELECT * FROM runtime_direct_access'),
        ).resolves.toMatchObject({ rows: [] });
        await client.query(`SET ROLE ${escapeIdentifier(roles.app)}`);
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
          }),
        ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
      });
    } finally {
      await databaseAdmin.query('DROP TABLE runtime_direct_access');
    }
  });

  it('requires a direct non-grantable CONNECT entry for the login', async () => {
    await databaseAdmin.query(
      `GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO PUBLIC`,
    );
    try {
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
          }),
        ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
      });
    } finally {
      await databaseAdmin.query(
        `REVOKE CONNECT ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC`,
      );
    }
  });
});
