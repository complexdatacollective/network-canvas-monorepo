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

function poolFor(database: string, user = 'postgres') {
  const pool = new Pool({
    host: '127.0.0.1',
    port,
    user,
    password,
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
  install: async (logins) => {
    for (const login of logins)
      await admin.query(
        `ALTER ROLE ${escapeIdentifier(login)} PASSWORD ${escapeLiteral(password)}`,
      );
  },
  connect: async (database, login) =>
    poolFor(database.database, login).connect(),
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

async function cleanup() {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
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
        install: async () => {
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

    const applied = await applyManagedPostgresEstate(
      admin,
      connectDatabase,
      credentials,
    );
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
