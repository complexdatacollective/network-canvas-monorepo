import { randomUUID } from 'node:crypto';

import { escapeIdentifier, type Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  assertSafePostgresRestrictedIdentities,
  type PostgresRestrictedIdentityPolicy,
} from '../postgres-restricted-identities.ts';
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
  backup: `runtime_backup_${suffix}`,
  backupLogin: `runtime_backup_login_${suffix}`,
  maintenanceLogin: `runtime_maint_login_${suffix}`,
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

  async function withSingletonPolicy(
    run: (policy: PostgresRestrictedIdentityPolicy) => Promise<void>,
  ): Promise<void> {
    const extraLogins = [roles.backupLogin, roles.maintenanceLogin];
    await databaseAdmin.query(`
      ALTER ROLE ${escapeIdentifier(roles.backupLogin)} LOGIN PASSWORD '${password}';
      ALTER ROLE ${escapeIdentifier(roles.maintenanceLogin)} LOGIN PASSWORD '${password}';
      REVOKE ${escapeIdentifier(roles.maintenance)} FROM ${escapeIdentifier(roles.login)};
      GRANT ${escapeIdentifier(roles.maintenance)} TO ${escapeIdentifier(roles.maintenanceLogin)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
      GRANT ${escapeIdentifier(roles.backup)} TO ${escapeIdentifier(roles.backupLogin)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
      GRANT CONNECT ON DATABASE ${escapeIdentifier(database)} TO ${extraLogins.map(escapeIdentifier).join(', ')};
      CREATE TABLE singleton_data (id integer, changed boolean);
      INSERT INTO singleton_data VALUES (1, false);
      CREATE VIEW singleton_backup_view AS SELECT * FROM singleton_data;
      CREATE MATERIALIZED VIEW singleton_backup_snapshot AS SELECT * FROM singleton_data;
      GRANT SELECT, INSERT, UPDATE, DELETE ON singleton_data TO ${allowedRoles.map(escapeIdentifier).join(', ')};
      GRANT SELECT ON singleton_data, singleton_backup_view, singleton_backup_snapshot TO ${escapeIdentifier(roles.backup)};
    `);
    try {
      await run({
        allowedLogins: [...allowedLogins, ...extraLogins],
        runtimeRoleSets: [[roles.app], [roles.maintenance]],
        backupRole: roles.backup,
      });
    } finally {
      await databaseAdmin.query(`
        DROP TABLE singleton_data CASCADE;
        REVOKE ${allowedRoles.map(escapeIdentifier).join(', ')}, ${escapeIdentifier(roles.backup)} FROM ${extraLogins.map(escapeIdentifier).join(', ')};
        REVOKE CONNECT ON DATABASE ${escapeIdentifier(database)} FROM ${extraLogins.map(escapeIdentifier).join(', ')};
        ALTER ROLE ${escapeIdentifier(roles.backupLogin)} NOLOGIN;
        ALTER ROLE ${escapeIdentifier(roles.maintenanceLogin)} NOLOGIN;
        GRANT ${escapeIdentifier(roles.maintenance)} TO ${escapeIdentifier(roles.login)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
      `);
    }
  }

  it('keeps quarantined enrolled identities subject to all capability checks only in explicit backup mode', async () => {
    await withSingletonPolicy(async (policy) => {
      const serving = runtimePool(roles.login, roles.app);
      const servingClient = await serving.connect();
      const closed = [roles.owner, roles.login, roles.maintenanceLogin];
      const options = { allowClosedEnrolledLogins: true };
      const inspected = await databaseAdmin.connect();
      try {
        await assertSafePostgresRestrictedIdentities(inspected, policy);
        for (const login of closed)
          await inspected.query(
            `ALTER ROLE ${escapeIdentifier(login)} NOLOGIN`,
          );
        await expect(
          assertSafePostgresRestrictedIdentities(inspected, policy),
        ).rejects.toMatchObject({ reason: 'logins' });
        await expect(
          assertSafePostgresRestrictedIdentities(inspected, policy, options),
        ).resolves.toBeUndefined();
        // An already admitted serving connection is still usable in PostgreSQL,
        // but normal runtime admission cannot opt into the backup exception.
        expect(
          (await servingClient.query('SELECT id FROM singleton_data')).rows,
        ).toEqual([{ id: 1 }]);
        await expect(
          assertSafePostgresRuntimeIdentity(servingClient, {
            ...policy,
            intendedRole: roles.app,
            allowedRoles: [roles.app],
          }),
        ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
        const refused = runtimePool(roles.login, roles.app);
        try {
          await expect(refused.query('SELECT 1')).rejects.toMatchObject({
            code: '28000',
          });
        } finally {
          await closeFixturePool(refused);
        }
        await inspected.query(`GRANT USAGE ON SCHEMA public TO ${escapeIdentifier(roles.maintenanceLogin)};
          GRANT UPDATE(changed) ON singleton_data TO ${escapeIdentifier(roles.maintenanceLogin)};
          SET ROLE ${escapeIdentifier(roles.maintenanceLogin)};
          UPDATE singleton_data SET changed = true;
          RESET ROLE`);
        expect(
          (await inspected.query('SELECT changed FROM singleton_data')).rows,
        ).toEqual([{ changed: true }]);
        await expect(
          assertSafePostgresRestrictedIdentities(inspected, policy, options),
        ).rejects.toMatchObject({ reason: 'access' });
        await inspected.query(`REVOKE ALL ON singleton_data FROM ${escapeIdentifier(roles.maintenanceLogin)};
          REVOKE ALL ON SCHEMA public FROM ${escapeIdentifier(roles.maintenanceLogin)}`);
        await expect(
          assertSafePostgresRestrictedIdentities(inspected, policy, options),
        ).resolves.toBeUndefined();
        await expect(
          assertSafePostgresRestrictedIdentities(
            inspected,
            {
              ...policy,
              allowedLogins: [...policy.allowedLogins, `missing_${suffix}`],
            },
            options,
          ),
        ).rejects.toMatchObject({ reason: 'logins' });
      } finally {
        await inspected.query('RESET ROLE');
        await inspected.query(`REVOKE ALL ON singleton_data FROM ${escapeIdentifier(roles.maintenanceLogin)};
          REVOKE ALL ON SCHEMA public FROM ${escapeIdentifier(roles.maintenanceLogin)}`);
        for (const login of closed)
          await inspected.query(`ALTER ROLE ${escapeIdentifier(login)} LOGIN`);
        inspected.release();
        servingClient.release();
        await closeFixturePool(serving);
      }
    });
  });

  it('validates the backup-only capability option before querying a supplied connection', async () => {
    await withSingletonPolicy(async (policy) => {
      const client = await databaseAdmin.connect();
      const query = vi.spyOn(client, 'query');
      try {
        for (const options of [
          null,
          [],
          { allowClosedEnrolledLogins: 'true' },
          { allowClosedEnrolledLogins: true, unexpected: true },
        ]) {
          await expect(
            Reflect.apply(assertSafePostgresRestrictedIdentities, undefined, [
              client,
              policy,
              options,
            ]),
          ).rejects.toMatchObject({ reason: 'configuration' });
        }
        expect(query).not.toHaveBeenCalled();
      } finally {
        query.mockRestore();
        client.release();
      }
    });
  });

  it('accepts independent singleton classes and backup reads while refusing cross-class SET ROLE', async () => {
    await withSingletonPolicy(async (policy) => {
      for (const [login, intendedRole] of [
        [roles.login, roles.app],
        [roles.maintenanceLogin, roles.maintenance],
      ] as const) {
        await withClient(runtimePool(login, intendedRole), async (client) => {
          await expect(
            assertSafePostgresRuntimeIdentity(client, {
              ...policy,
              intendedRole,
              allowedRoles: [intendedRole],
            }),
          ).resolves.toBeUndefined();
          expect(
            (await client.query('SELECT id FROM singleton_data')).rows,
          ).toEqual([{ id: 1 }]);
          await expect(
            client.query(
              `SET ROLE ${escapeIdentifier(intendedRole === roles.app ? roles.maintenance : roles.app)}`,
            ),
          ).rejects.toMatchObject({ code: '42501' });
        });
      }
      await withClient(
        runtimePool(roles.backupLogin, roles.backup),
        async (client) => {
          for (const relation of [
            'singleton_data',
            'singleton_backup_view',
            'singleton_backup_snapshot',
          ]) {
            expect(
              (await client.query(`SELECT id FROM ${relation}`)).rows,
            ).toEqual([{ id: 1 }]);
          }
          await expect(
            client.query('UPDATE singleton_data SET changed = true'),
          ).rejects.toMatchObject({ code: '42501' });
        },
      );
    });
  });

  it('refuses mixed singleton classes even when both class memberships otherwise look safe', async () => {
    await withSingletonPolicy(async (policy) => {
      await databaseAdmin.query(
        `GRANT ${escapeIdentifier(roles.maintenance)} TO ${escapeIdentifier(roles.login)} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE`,
      );
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        await client.query(`SET ROLE ${escapeIdentifier(roles.maintenance)}`);
        await client.query(`SET ROLE ${escapeIdentifier(roles.app)}`);
        await expect(
          assertSafePostgresRestrictedIdentities(client, policy),
        ).rejects.toMatchObject({ reason: 'memberships' });
      });
    });
  });

  it.each([roles.maintenanceLogin, roles.backupLogin])(
    'refuses direct column data access held by another singleton login %s',
    async (login) => {
      await withSingletonPolicy(async (policy) => {
        await databaseAdmin.query(
          `GRANT UPDATE(changed) ON singleton_data TO ${escapeIdentifier(login)}`,
        );
        const intendedRole =
          login === roles.backupLogin ? roles.backup : roles.maintenance;
        await withClient(runtimePool(login, intendedRole), async (client) => {
          await client.query('SET ROLE NONE');
          expect(
            (await client.query('UPDATE singleton_data SET changed = true'))
              .rowCount,
          ).toBe(1);
        });
        await withClient(
          runtimePool(roles.login, roles.app),
          async (client) => {
            await expect(
              assertSafePostgresRuntimeIdentity(client, {
                ...policy,
                intendedRole: roles.app,
                allowedRoles: [roles.app],
              }),
            ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
          },
        );
      });
    },
  );

  it.each(['singleton_backup_view', 'singleton_backup_snapshot'])(
    'refuses runtime SELECT on owner-backed relation %s while preserving backup reads',
    async (relation) => {
      await withSingletonPolicy(async (policy) => {
        await databaseAdmin.query(
          `GRANT SELECT ON ${relation} TO ${escapeIdentifier(roles.maintenance)}`,
        );
        await withClient(
          runtimePool(roles.maintenanceLogin, roles.maintenance),
          async (client) => {
            expect(
              (await client.query(`SELECT id FROM ${relation}`)).rows,
            ).toEqual([{ id: 1 }]);
          },
        );
        await withClient(
          runtimePool(roles.login, roles.app),
          async (client) => {
            await expect(
              assertSafePostgresRestrictedIdentities(client, policy),
            ).rejects.toMatchObject({ reason: 'access' });
          },
        );
      });
    },
  );

  it.each([
    'singleton_data',
    'singleton_backup_view',
    'singleton_backup_snapshot',
  ])(
    'refuses backup SELECT delegation on %s before it can grant runtime access',
    async (relation) => {
      await withSingletonPolicy(async (policy) => {
        await databaseAdmin.query(
          `GRANT SELECT ON ${relation} TO ${escapeIdentifier(roles.backup)} WITH GRANT OPTION`,
        );
        await withClient(
          runtimePool(roles.login, roles.app),
          async (client) => {
            await expect(
              assertSafePostgresRestrictedIdentities(client, policy),
            ).rejects.toMatchObject({ reason: 'access' });
          },
        );
        await withClient(
          runtimePool(roles.backupLogin, roles.backup),
          async (client) => {
            await client.query(
              `GRANT SELECT ON ${relation} TO ${escapeIdentifier(roles.maintenance)}`,
            );
          },
        );
        await withClient(
          runtimePool(roles.maintenanceLogin, roles.maintenance),
          async (client) => {
            expect(
              (await client.query(`SELECT id FROM ${relation}`)).rows,
            ).toEqual([{ id: 1 }]);
          },
        );
      });
    },
  );

  it.each([
    { runtimeRoleSets: null },
    { runtimeRoleSets: [] },
    { runtimeRoleSets: [[roles.app], [roles.app]] },
    { runtimeRoleSets: [[roles.app], 'not-an-array'] },
    { runtimeRoleSets: [[roles.app], [1]] },
    { runtimeRoleSets: [[roles.app]], backupRole: roles.app },
    { runtimeRoleSets: [[roles.app]], backupRole: null },
  ])(
    'validates complete role classes before querying (%j)',
    async (invalid) => {
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        const query = vi.spyOn(client, 'query');
        try {
          await expect(
            assertSafePostgresRestrictedIdentities(client, {
              allowedLogins,
              ...invalid,
            } as never),
          ).rejects.toMatchObject({ reason: 'configuration' });
          expect(query).not.toHaveBeenCalled();
        } finally {
          query.mockRestore();
        }
      });
    },
  );

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
              runtimeRoleSets: [allowedRoles],
              allowedLogins,
            }),
          ).resolves.toBeUndefined();
        },
      );
    },
  );

  it.each([roles.app, roles.maintenance])(
    'refuses an explicitly administrative session pinned to %s',
    async (intendedRole) => {
      await withClient(
        runtimePool(roles.login, intendedRole),
        async (client) => {
          await expect(
            assertSafePostgresRuntimeIdentity(client, {
              intendedRole,
              allowedRoles,
              runtimeRoleSets: [allowedRoles],
              allowedLogins,
              administrativeLogins: [roles.login],
            }),
          ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_UNSAFE');
        },
      );
    },
  );

  it.each([
    null,
    'not-an-array',
    [1],
    ['unenrolled-admin'],
    [roles.owner, roles.owner],
  ])(
    'validates administrative inventory before any database query (%j)',
    async (administrativeLogins) => {
      await withClient(runtimePool(roles.login, roles.app), async (client) => {
        const query = vi.spyOn(client, 'query');
        try {
          await expect(
            assertSafePostgresRuntimeIdentity(client, {
              intendedRole: roles.app,
              allowedRoles,
              runtimeRoleSets: [allowedRoles],
              allowedLogins,
              administrativeLogins: administrativeLogins as never,
            }),
          ).rejects.toThrow('POSTGRES_RUNTIME_IDENTITY_INVALID');
          expect(query).not.toHaveBeenCalled();
        } finally {
          query.mockRestore();
        }
      });
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
              runtimeRoleSets: [allowedRoles],
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
              runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
              runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
                  runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
      const mutableAdministrators = [roles.owner];
      const verification = assertSafePostgresRuntimeIdentity(client, {
        intendedRole: roles.app,
        allowedRoles: mutable,
        runtimeRoleSets: [mutable],
        allowedLogins: mutableLogins,
        administrativeLogins: mutableAdministrators,
      });
      mutable.splice(0, mutable.length, roles.outside);
      mutableLogins.splice(0, mutableLogins.length, roles.outside);
      mutableAdministrators.splice(
        0,
        mutableAdministrators.length,
        roles.login,
      );
      await expect(verification).resolves.toBeUndefined();
      await expect(
        assertSafePostgresRuntimeIdentity(client, {
          intendedRole: roles.app,
          allowedRoles: [roles.app, roles.app],
          runtimeRoleSets: [allowedRoles],
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
          runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
            runtimeRoleSets: [allowedRoles],
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
