import { randomUUID } from 'node:crypto';

import { escapeIdentifier, type Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertSafePostgresRuntimeIdentity } from '../postgres-runtime-identity.ts';
import { revokeLargeObjectPrivilegesSql } from '../role-bootstrap.ts';
import { fixturePool, closeFixturePool } from './support/pool-lifecycle.ts';
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
const allowedLogins = [roles.owner, roles.login];
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
  if (CI) throw new Error('PostgreSQL is required for runtime identity tests.');
}

function runtimePool(
  login: string,
  intendedRole: string,
  databaseName = database,
): Pool {
  return fixturePool({
    ...connection,
    database: databaseName,
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
    await closeFixturePool(pool);
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
    databaseAdmin = fixturePool({ ...connection, database });
    await databaseAdmin.query(
      `REVOKE CONNECT, TEMPORARY ON DATABASE ${escapeIdentifier(database)} FROM PUBLIC, ${allowedRoles.map(escapeIdentifier).join(', ')};
       GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(roles.login)};
       ${revokeLargeObjectPrivilegesSql()}`,
    );
  });

  afterAll(async () => {
    await closeFixturePool(databaseAdmin);
    await administrator.query(
      `DROP DATABASE ${escapeIdentifier(database)} WITH (FORCE)`,
    );
    await administrator.query(
      `DROP ROLE ${Object.values(roles).map(escapeIdentifier).join(', ')}`,
    );
    await closeFixturePool(administrator);
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
              allowedLogins,
            }),
          ).resolves.toBeUndefined();
        },
      );
    },
  );

  it('refuses an unenrolled login sharing the reviewed runtime roles after a CONNECT grant', async () => {
    await databaseAdmin.query(
      `ALTER ROLE ${escapeIdentifier(roles.outside)} LOGIN PASSWORD '${password}';
       GRANT ${allowedRoles.map(escapeIdentifier).join(', ')} TO ${escapeIdentifier(roles.outside)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
       CREATE TABLE runtime_outside_connect (id integer PRIMARY KEY);
       GRANT INSERT ON runtime_outside_connect TO ${escapeIdentifier(roles.app)}`,
    );
    try {
      const refused = runtimePool(roles.outside, roles.app);
      try {
        await expect(refused.query('SELECT 1')).rejects.toThrow(
          'permission denied for database',
        );
      } finally {
        await closeFixturePool(refused);
      }
      await databaseAdmin.query(
        `GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(roles.outside)}`,
      );
      await withClient(
        runtimePool(roles.outside, roles.app),
        async (client) => {
          expect(
            (
              await client.query(
                'INSERT INTO runtime_outside_connect VALUES (1)',
              )
            ).rowCount,
          ).toBe(1);
          await expect(
            assertSafePostgresRuntimeIdentity(client, {
              intendedRole: roles.app,
              allowedRoles,
              allowedLogins,
            }),
          ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
        },
      );
      await withClient(
        runtimePool(roles.login, roles.maintenance),
        async (client) => {
          await expect(
            assertSafePostgresRuntimeIdentity(client, {
              intendedRole: roles.maintenance,
              allowedRoles,
              allowedLogins,
            }),
          ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
        },
      );
    } finally {
      await databaseAdmin.query(`REVOKE CONNECT ON DATABASE ${escapeIdentifier(database)} FROM ${escapeIdentifier(roles.outside)};
        REVOKE ${allowedRoles.map(escapeIdentifier).join(', ')} FROM ${escapeIdentifier(roles.outside)};
        ALTER ROLE ${escapeIdentifier(roles.outside)} NOLOGIN;
        DROP TABLE runtime_outside_connect`);
    }
  });

  it('allows disjoint database enrollment while sharing the cluster runtime roles', async () => {
    const siblingDatabase = `runtime_sibling_${suffix}`;
    await administrator.query(
      `CREATE DATABASE ${escapeIdentifier(siblingDatabase)} OWNER ${escapeIdentifier(roles.owner)} TEMPLATE template0`,
    );
    const siblingAdmin = fixturePool({
      ...connection,
      database: siblingDatabase,
    });
    try {
      await siblingAdmin.query(`ALTER ROLE ${escapeIdentifier(roles.outside)} LOGIN PASSWORD '${password}';
        GRANT ${allowedRoles.map(escapeIdentifier).join(', ')} TO ${escapeIdentifier(roles.outside)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
        REVOKE CONNECT, TEMPORARY ON DATABASE ${escapeIdentifier(siblingDatabase)} FROM PUBLIC;
        GRANT CONNECT ON DATABASE ${escapeIdentifier(siblingDatabase)} TO ${escapeIdentifier(roles.outside)};
        ${revokeLargeObjectPrivilegesSql()}`);
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
            allowedLogins,
          }),
        ).resolves.toBeUndefined();
      });
      await withClient(
        runtimePool(roles.outside, roles.app, siblingDatabase),
        async (client) => {
          await expect(
            assertSafePostgresRuntimeIdentity(client, {
              intendedRole: roles.app,
              allowedRoles,
              allowedLogins: [roles.owner, roles.outside],
            }),
          ).resolves.toBeUndefined();
        },
      );
    } finally {
      await closeFixturePool(siblingAdmin);
      await administrator.query(
        `DROP DATABASE ${escapeIdentifier(siblingDatabase)} WITH (FORCE)`,
      );
      await administrator.query(`REVOKE ${allowedRoles.map(escapeIdentifier).join(', ')} FROM ${escapeIdentifier(roles.outside)};
        ALTER ROLE ${escapeIdentifier(roles.outside)} NOLOGIN`);
    }
  });

  it('refuses an outside LOGIN with only inherited database CONNECT', async () => {
    await databaseAdmin.query(`ALTER ROLE ${escapeIdentifier(roles.outside)} LOGIN INHERIT PASSWORD '${password}';
      GRANT ${escapeIdentifier(roles.owner)} TO ${escapeIdentifier(roles.outside)} WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`);
    try {
      await withClient(
        runtimePool(roles.outside, roles.app),
        async (client) => {
          expect((await client.query('SELECT 1 AS reached')).rows).toEqual([
            { reached: 1 },
          ]);
        },
      );
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
            allowedLogins,
          }),
        ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
      });
    } finally {
      await databaseAdmin.query(`REVOKE ${escapeIdentifier(roles.owner)} FROM ${escapeIdentifier(roles.outside)};
        ALTER ROLE ${escapeIdentifier(roles.outside)} NOLOGIN NOINHERIT`);
    }
  });

  it('refuses an admitted outsider even after its CONNECT grant is revoked', async () => {
    await databaseAdmin.query(`ALTER ROLE ${escapeIdentifier(roles.outside)} LOGIN PASSWORD '${password}';
      GRANT ${allowedRoles.map(escapeIdentifier).join(', ')} TO ${escapeIdentifier(roles.outside)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
      GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${escapeIdentifier(roles.outside)}`);
    try {
      await withClient(
        runtimePool(roles.outside, roles.app),
        async (outside) => {
          await databaseAdmin.query(
            `REVOKE CONNECT ON DATABASE ${escapeIdentifier(database)} FROM ${escapeIdentifier(roles.outside)}`,
          );
          expect((await outside.query('SELECT 1 AS reached')).rows).toEqual([
            { reached: 1 },
          ]);
          await withClient(
            runtimePool(roles.login, roles.app),
            async (client) => {
              await expect(
                assertSafePostgresRuntimeIdentity(client, {
                  intendedRole: roles.app,
                  allowedRoles,
                  allowedLogins,
                }),
              ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
            },
          );
        },
      );
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
            allowedLogins,
          }),
        ).resolves.toBeUndefined();
      });
    } finally {
      await databaseAdmin.query(`REVOKE CONNECT ON DATABASE ${escapeIdentifier(database)} FROM ${escapeIdentifier(roles.outside)};
        REVOKE ${allowedRoles.map(escapeIdentifier).join(', ')} FROM ${escapeIdentifier(roles.outside)};
        ALTER ROLE ${escapeIdentifier(roles.outside)} NOLOGIN`);
    }
  });

  it.each(
    [
      [],
      [roles.owner],
      [roles.owner, roles.app],
      [roles.owner, roles.login, 'absent_login'],
    ].map((logins) => ({ logins })),
  )(
    'refuses incomplete, missing or non-LOGIN enrollment %j',
    async ({ logins }) => {
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await expect(
          assertSafePostgresRuntimeIdentity(client, {
            intendedRole: roles.app,
            allowedRoles,
            allowedLogins: logins,
          }),
        ).rejects.toThrow(/POSTGRES_RUNTIME_IDENTITY_(INVALID|UNSAFE)/);
      });
    },
  );
  it('copies and validates configuration before its first database await', async () => {
    await withClient(runtimePool(roles.login, roles.app), async (client) => {
      const mutable = [...allowedRoles];
      const mutableLogins = [...allowedLogins];
      const verification = assertSafePostgresRuntimeIdentity(client, {
        intendedRole: roles.app,
        allowedRoles: mutable,
        allowedLogins: mutableLogins,
      });
      mutable.splice(0, mutable.length, roles.outside);
      mutableLogins.splice(0, mutableLogins.length, roles.outside);
      await expect(verification).resolves.toBeUndefined();
      await expect(
        assertSafePostgresRuntimeIdentity(client, {
          intendedRole: roles.app,
          allowedRoles: [roles.app, roles.app],
          allowedLogins,
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
          allowedLogins,
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
            allowedLogins,
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
            allowedLogins,
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
            allowedLogins,
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
            allowedLogins,
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
