import { Pool, escapeIdentifier, escapeLiteral, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  applyManagedPostgresEstate,
  MANAGED_POSTGRES_DATABASES,
  planManagedPostgresEstate,
  type ManagedPostgresCredentialBoundary,
  type ManagedPostgresDatabase,
  UnsafeManagedPostgresEstateError,
} from '../managed-postgres-estate.ts';

const port = Number(process.env.MANAGED_POSTGRES_TEST_PORT ?? 55443);
const lowTuningPort = Number(
  process.env.MANAGED_POSTGRES_LOW_TUNING_TEST_PORT ?? 55444,
);
const password = 'managed-estate-test-only';
const enabled = process.env.MANAGED_POSTGRES_ESTATE_TEST === 'true';
const admin = new Pool({
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password,
  database: 'postgres',
  max: 2,
  connectionTimeoutMillis: 500,
});
admin.on('error', () => undefined);
const lowTuningAdmin = new Pool({
  host: '127.0.0.1',
  port: lowTuningPort,
  user: 'postgres',
  password,
  database: 'postgres',
  max: 1,
  connectionTimeoutMillis: 500,
});
lowTuningAdmin.on('error', () => undefined);
let available = false;
let lowTuningAvailable = false;
const pools: Pool[] = [];
const stagedPasswords = new Map<string, string>();
const activePasswords = new Map<string, string>();

beforeAll(async () => {
  if (!enabled) return;
  try {
    await admin.query('SELECT 1');
    available = true;
  } catch (error) {
    available = false;
    throw error;
  }
  try {
    await lowTuningAdmin.query('SELECT 1');
    lowTuningAvailable = true;
  } catch (error) {
    lowTuningAvailable = false;
    throw error;
  }
});

function poolFor(
  database: string,
  user = 'postgres',
  credential = activePasswords.get(user) ?? password,
) {
  const pool = new Pool({
    host: '127.0.0.1',
    port,
    user,
    password: credential,
    database,
    max: 1,
  });
  pool.on('error', () => undefined);
  pools.push(pool);
  return pool;
}

const connectDatabase = async (database: ManagedPostgresDatabase) =>
  poolFor(database.database).connect();

const credentials: ManagedPostgresCredentialBoundary = {
  stage: async (staged) => {
    stagedPasswords.clear();
    for (const { loginName, password: stagedPassword } of staged)
      stagedPasswords.set(loginName, stagedPassword);
  },
  connect: async (database, credential) => {
    expect(stagedPasswords.get(credential.loginName)).toBe(credential.password);
    return poolFor(
      database.database,
      credential.loginName,
      credential.password,
    ).connect();
  },
  activate: async (logins) => {
    for (const login of logins) {
      const stagedPassword = stagedPasswords.get(login);
      if (!stagedPassword) throw new Error('missing staged test credential');
      activePasswords.set(login, stagedPassword);
    }
  },
};

function failFirstAdminQuery(matcher: RegExp): Pool {
  let pendingFailure = true;
  return {
    connect: async () => {
      const client = await admin.connect();
      const wrapped = Object.create(client) as PoolClient;
      const query = client.query.bind(client);
      wrapped.query = ((...args: unknown[]) => {
        const statement = args[0];
        const text =
          typeof statement === 'string'
            ? statement
            : typeof statement === 'object' &&
                statement !== null &&
                'text' in statement &&
                typeof statement.text === 'string'
              ? statement.text
              : '';
        if (pendingFailure && matcher.test(text)) {
          pendingFailure = false;
          throw new Error('synthetic interrupted database creation');
        }
        return Reflect.apply(query, client, args);
      }) as PoolClient['query'];
      wrapped.release = client.release.bind(client);
      return wrapped;
    },
  } as unknown as Pool;
}

function falseFirstTerminationAdmin(onAttempt: () => void): Pool {
  let pendingFalse = true;
  return {
    connect: async () => {
      const client = await admin.connect();
      const wrapped = Object.create(client) as PoolClient;
      const query = client.query.bind(client);
      wrapped.query = ((...args: unknown[]) => {
        const statement = args[0];
        const text = typeof statement === 'string' ? statement : '';
        if (
          text.includes('pg_catalog.pg_terminate_backend(activity.pid, 5000)')
        ) {
          onAttempt();
          if (pendingFalse) {
            pendingFalse = false;
            return Reflect.apply(query, client, [
              text.replace(
                'pg_catalog.pg_terminate_backend(activity.pid, 5000)',
                'false',
              ),
              ...args.slice(1),
            ]);
          }
        }
        return Reflect.apply(query, client, args);
      }) as PoolClient['query'];
      wrapped.release = client.release.bind(client);
      return wrapped;
    },
  } as unknown as Pool;
}

async function cleanup() {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
  stagedPasswords.clear();
  activePasswords.clear();
  if (!available) return;
  const logins = MANAGED_POSTGRES_DATABASES.flatMap(
    ({ logins: configuredLogins }) => Object.values(configuredLogins),
  );
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = ANY($1::text[]) AND pid <> pg_backend_pid()`,
    [MANAGED_POSTGRES_DATABASES.map(({ database }) => database)],
  );
  for (const { database } of MANAGED_POSTGRES_DATABASES)
    await admin.query(`DROP DATABASE IF EXISTS ${escapeIdentifier(database)}`);
  await admin.query(
    `DROP ROLE IF EXISTS ${[
      ...new Set([
        ...MANAGED_POSTGRES_DATABASES.flatMap(({ roles }) =>
          Object.values(roles),
        ),
        ...logins,
      ]),
    ]
      .map(escapeIdentifier)
      .join(', ')}`,
  );
}

afterAll(async () => {
  await cleanup();
  await admin.end();
  await lowTuningAdmin.end();
});

describe('managed PostgreSQL estate enrollment', () => {
  it('refuses insufficient provider tuning before mutation', async () => {
    if (!lowTuningAvailable) return;
    await expect(planManagedPostgresEstate(lowTuningAdmin)).rejects.toEqual(
      new UnsafeManagedPostgresEstateError('tuning'),
    );
    expect(
      (
        await lowTuningAdmin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_database WHERE datname = ANY($1::text[])',
          [MANAGED_POSTGRES_DATABASES.map(({ database }) => database)],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it('fails closed after a partial failure, resumes, and proves database isolation', async () => {
    if (!available) return;
    await cleanup();
    expect(
      (await planManagedPostgresEstate(admin)).databases.every(
        ({ state }) => state === 'absent',
      ),
    ).toBe(true);

    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, {
        ...credentials,
        stage: async () => {
          throw new Error('synthetic credential boundary failure');
        },
      }),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('credentials'));
    expect(
      (await planManagedPostgresEstate(admin)).databases.every(
        ({ state }) => state === 'quarantined',
      ),
    ).toBe(true);
    expect(
      (
        await admin.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_roles
      WHERE rolname = ANY($1::text[]) AND rolcanlogin`,
          [
            MANAGED_POSTGRES_DATABASES.flatMap(({ logins }) =>
              Object.values(logins),
            ),
          ],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);

    const authenticated: string[] = [];
    let activated = false;
    const auditedCredentials: ManagedPostgresCredentialBoundary = {
      stage: async (staged) => {
        expect(
          new Set(staged.map(({ password: stagedPassword }) => stagedPassword))
            .size,
        ).toBe(staged.length);
        expect(staged.every(({ password: fresh }) => fresh !== password)).toBe(
          true,
        );
        await credentials.stage(staged);
      },
      connect: async (database, credential) => {
        expect(activated).toBe(false);
        authenticated.push(credential.loginName);
        return credentials.connect(database, credential);
      },
      activate: async (logins) => {
        expect(new Set(authenticated)).toEqual(new Set(logins));
        expect(authenticated).toHaveLength(logins.length);
        activated = true;
        await credentials.activate(logins);
      },
    };
    const applied = await applyManagedPostgresEstate(
      admin,
      connectDatabase,
      auditedCredentials,
    );
    expect(activated).toBe(true);
    expect(applied.databases.every(({ state }) => state === 'active')).toBe(
      true,
    );
    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, credentials),
    ).resolves.toEqual(applied);

    const source = MANAGED_POSTGRES_DATABASES[0]!;
    const target = MANAGED_POSTGRES_DATABASES[1]!;
    await expect(
      poolFor(target.database, source.logins.runtime).query('SELECT 1'),
    ).rejects.toMatchObject({ code: '42501' });

    const owner = poolFor(source.database, source.logins.ownerMigrator);
    const runtime = poolFor(source.database, source.logins.runtime);
    const backup = poolFor(source.database, source.logins.backup);
    await owner.query('CREATE TABLE boundary_probe(id integer PRIMARY KEY)');
    await owner.query(`GRANT SELECT, INSERT ON boundary_probe TO ${escapeIdentifier(source.roles.app)};
      GRANT SELECT ON boundary_probe TO ${escapeIdentifier(source.roles.backup)}`);
    await runtime.query(`SET ROLE ${escapeIdentifier(source.roles.app)}`);
    await runtime.query('INSERT INTO boundary_probe VALUES (1)');
    await backup.query(`SET ROLE ${escapeIdentifier(source.roles.backup)}`);
    await expect(
      backup.query('SELECT * FROM boundary_probe'),
    ).resolves.toMatchObject({ rowCount: 1 });
    await expect(
      backup.query('INSERT INTO boundary_probe VALUES (2)'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('never publishes staged credentials when database-local readback fails', async () => {
    if (!available) return;
    await cleanup();
    let connections = 0;
    let activated = false;
    const unsafeConnector = async (database: ManagedPostgresDatabase) => {
      const connection = await connectDatabase(database);
      connections += 1;
      if (connections === MANAGED_POSTGRES_DATABASES.length + 1)
        await connection.query(
          `GRANT CONNECT ON DATABASE ${escapeIdentifier(database.database)} TO PUBLIC`,
        );
      return connection;
    };
    await expect(
      applyManagedPostgresEstate(admin, unsafeConnector, {
        ...credentials,
        activate: async () => {
          activated = true;
        },
      }),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('readback'));
    expect(activated).toBe(false);
    expect(
      (
        await admin.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_roles
           WHERE rolname = ANY($1::text[]) AND rolcanlogin`,
          [
            MANAGED_POSTGRES_DATABASES.flatMap(({ logins }) =>
              Object.values(logins),
            ),
          ],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await admin.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM pg_database
           WHERE datname = ANY($1::text[]) AND datconnlimit = 0`,
          [MANAGED_POSTGRES_DATABASES.map(({ database }) => database)],
        )
      ).rows,
    ).toEqual([{ count: MANAGED_POSTGRES_DATABASES.length }]);
  });

  it('authenticates the freshly staged owner and migrator credential', async () => {
    if (!available) return;
    await cleanup();
    const owner = MANAGED_POSTGRES_DATABASES[0]!.logins.ownerMigrator;
    let attempted = false;
    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, {
        ...credentials,
        connect: async (database, credential) => {
          if (credential.loginName === owner) {
            attempted = true;
            throw new Error('synthetic owner credential refusal');
          }
          return credentials.connect(database, credential);
        },
      }),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('readback'));
    expect(attempted).toBe(true);
  });

  it('retries a timed-out managed-session termination and verifies the drain', async () => {
    if (!available) return;
    await cleanup();
    await applyManagedPostgresEstate(admin, connectDatabase, credentials);
    const database = MANAGED_POSTGRES_DATABASES[0]!;
    const session = poolFor(database.database, database.logins.runtime);
    await session.query('SELECT 1');
    let terminationAttempts = 0;
    await expect(
      applyManagedPostgresEstate(
        falseFirstTerminationAdmin(() => {
          terminationAttempts += 1;
        }),
        connectDatabase,
        credentials,
      ),
    ).resolves.toMatchObject({
      databases: MANAGED_POSTGRES_DATABASES.map(({ key, database: name }) => ({
        key,
        database: name,
        state: 'active',
      })),
    });
    expect(terminationAttempts).toBeGreaterThanOrEqual(2);
    await expect(session.query('SELECT 1')).rejects.toThrow();
  });

  it('resumes after the first database connector fails', async () => {
    if (!available) return;
    await cleanup();
    let failFirstConnection = true;
    await expect(
      applyManagedPostgresEstate(
        admin,
        async (database) => {
          if (failFirstConnection) {
            failFirstConnection = false;
            throw new Error('synthetic first database connection failure');
          }
          return connectDatabase(database);
        },
        credentials,
      ),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('apply'));
    expect(
      (await planManagedPostgresEstate(admin)).databases.every(
        ({ state }) => state === 'quarantined',
      ),
    ).toBe(true);
    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, credentials),
    ).resolves.toMatchObject({
      databases: MANAGED_POSTGRES_DATABASES.map(({ key, database }) => ({
        key,
        database,
        state: 'active',
      })),
    });
  });

  it('resumes exact durable intent after interruption before CREATE DATABASE', async () => {
    if (!available) return;
    await cleanup();
    await expect(
      applyManagedPostgresEstate(
        failFirstAdminQuery(/^CREATE DATABASE/u),
        connectDatabase,
        credentials,
      ),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('apply'));
    expect((await planManagedPostgresEstate(admin)).databases[0]).toMatchObject(
      {
        database: MANAGED_POSTGRES_DATABASES[0]!.database,
        state: 'pending',
      },
    );
    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, credentials),
    ).resolves.toMatchObject({
      databases: MANAGED_POSTGRES_DATABASES.map(({ key, database }) => ({
        key,
        database,
        state: 'active',
      })),
    });
  });

  it.each([
    { stage: 'database marker', matcher: /^COMMENT ON DATABASE/u },
    { stage: 'admission ACL', matcher: /^REVOKE CONNECT/u },
  ])(
    'resumes the exact inaccessible database after $stage failure',
    async ({ matcher }) => {
      if (!available) return;
      await cleanup();
      await expect(
        applyManagedPostgresEstate(
          failFirstAdminQuery(matcher),
          connectDatabase,
          credentials,
        ),
      ).rejects.toEqual(new UnsafeManagedPostgresEstateError('apply'));
      expect(
        (await planManagedPostgresEstate(admin)).databases[0],
      ).toMatchObject({
        database: MANAGED_POSTGRES_DATABASES[0]!.database,
        state: 'creating',
      });
      expect(
        (
          await admin.query<{
            datallowconn: boolean;
            datconnlimit: number;
            defaultAcl: boolean;
          }>(
            `SELECT datallowconn, datconnlimit, datacl IS NULL AS "defaultAcl"
           FROM pg_database WHERE datname = $1`,
            [MANAGED_POSTGRES_DATABASES[0]!.database],
          )
        ).rows,
      ).toEqual([{ datallowconn: false, datconnlimit: 0, defaultAcl: true }]);
      await expect(
        applyManagedPostgresEstate(admin, connectDatabase, credentials),
      ).resolves.toMatchObject({
        databases: MANAGED_POSTGRES_DATABASES.map(({ key, database }) => ({
          key,
          database,
          state: 'active',
        })),
      });
    },
  );

  it('refuses a populated database that diverged from durable intent without deleting it', async () => {
    if (!available) return;
    await cleanup();
    await expect(
      applyManagedPostgresEstate(
        failFirstAdminQuery(/^COMMENT ON DATABASE/u),
        connectDatabase,
        credentials,
      ),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('apply'));
    const database = MANAGED_POSTGRES_DATABASES[0]!.database;
    await admin.query(
      `ALTER DATABASE ${escapeIdentifier(database)} ALLOW_CONNECTIONS true`,
    );
    const session = poolFor(database);
    await session.query('CREATE TABLE intent_collision_probe(value text)');
    await session.query(
      "INSERT INTO intent_collision_probe VALUES ('preserved')",
    );
    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, credentials),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('identity'));
    await expect(
      session.query('SELECT value FROM intent_collision_probe'),
    ).resolves.toMatchObject({ rows: [{ value: 'preserved' }] });
    expect(
      (
        await admin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_database WHERE datname = $1',
          [database],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });

  it('keeps a colliding unrelated login and its active session unchanged', async () => {
    if (!available) return;
    await cleanup();
    const collision = MANAGED_POSTGRES_DATABASES[0]!.logins.runtime;
    await admin.query(
      `CREATE ROLE ${escapeIdentifier(collision)} LOGIN PASSWORD ${escapeLiteral(password)}`,
    );
    const session = new Pool({
      host: '127.0.0.1',
      port,
      user: collision,
      password,
      database: 'postgres',
      max: 1,
    });
    session.on('error', () => undefined);
    await session.query('SELECT 1');
    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, credentials),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('identity'));
    await expect(session.query('SELECT 1')).resolves.toMatchObject({
      rowCount: 1,
    });
    expect(
      (
        await admin.query<{ rolcanlogin: boolean }>(
          'SELECT rolcanlogin FROM pg_roles WHERE rolname = $1',
          [collision],
        )
      ).rows,
    ).toEqual([{ rolcanlogin: true }]);
    expect(
      (
        await admin.query<{ count: number }>(
          'SELECT count(*)::int AS count FROM pg_database WHERE datname = ANY($1::text[])',
          [MANAGED_POSTGRES_DATABASES.map(({ database }) => database)],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    await session.end();
    await admin.query(`DROP ROLE ${escapeIdentifier(collision)}`);
  });

  it('keeps a colliding unrelated database admission unchanged', async () => {
    if (!available) return;
    await cleanup();
    const collision = MANAGED_POSTGRES_DATABASES[0]!.database;
    await admin.query(`CREATE DATABASE ${escapeIdentifier(collision)}`);
    const session = poolFor(collision);
    await session.query('CREATE TABLE collision_probe(value text)');
    await session.query("INSERT INTO collision_probe VALUES ('preserved')");
    await expect(
      applyManagedPostgresEstate(admin, connectDatabase, credentials),
    ).rejects.toEqual(new UnsafeManagedPostgresEstateError('identity'));
    expect(
      (
        await admin.query<{ datconnlimit: number }>(
          'SELECT datconnlimit FROM pg_database WHERE datname = $1',
          [collision],
        )
      ).rows,
    ).toEqual([{ datconnlimit: -1 }]);
    await expect(session.query('SELECT 1')).resolves.toMatchObject({
      rowCount: 1,
    });
    await expect(
      session.query('SELECT value FROM collision_probe'),
    ).resolves.toMatchObject({ rows: [{ value: 'preserved' }] });
  });
});
