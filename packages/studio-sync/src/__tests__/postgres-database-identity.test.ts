import { randomUUID } from 'node:crypto';

import { escapeIdentifier, type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { assertSamePostgresDatabase } from '../postgres-database-identity.ts';
import { closeFixturePool, fixturePool } from './support/pool-lifecycle.ts';
import { CI, PGPASSWORD, PGPORT, PGUSER } from './test-env.ts';

const connection = {
  host: '127.0.0.1',
  port: PGPORT,
  user: PGUSER,
  password: PGPASSWORD,
  database: 'postgres',
  max: 3,
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
    throw new Error('PostgreSQL is required for database identity tests.');
}
const names = [0, 1].map(
  () => `database_identity_${randomUUID().replaceAll('-', '')}`,
);
const pools = names.map((database) => fixturePool({ ...connection, database }));

async function checkPair(
  secondDatabase: 0 | 1,
  run: (first: PoolClient, second: PoolClient) => Promise<void>,
): Promise<void> {
  const first = await pools[0]!.connect();
  const second = await pools[secondDatabase]!.connect();
  try {
    await first.query('BEGIN READ ONLY');
    await second.query('BEGIN READ ONLY');
    await run(first, second);
  } finally {
    await Promise.all([first.query('ROLLBACK'), second.query('ROLLBACK')]);
    for (const client of [first, second]) {
      expect(
        (
          await client.query(
            "SELECT count(*)::int AS held FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'",
          )
        ).rows,
      ).toEqual([{ held: 0 }]);
      client.release();
    }
  }
}

describe.skipIf(!reachable)('live PostgreSQL database identity', () => {
  beforeAll(async () => {
    for (const database of names)
      await administrator.query(
        `CREATE DATABASE ${escapeIdentifier(database)} TEMPLATE template0`,
      );
  });
  afterAll(async () => {
    await Promise.all(pools.map(closeFixturePool));
    for (const database of names)
      await administrator.query(`DROP DATABASE ${escapeIdentifier(database)}`);
    await closeFixturePool(administrator);
  });

  it('proves two different backends share a database without data writes', async () => {
    await checkPair(0, async (first, second) => {
      const identities = await Promise.all(
        [first, second].map(
          async (client) =>
            (
              await client.query<{ pid: number; read_only: string }>(
                "SELECT pg_backend_pid() AS pid, current_setting('transaction_read_only') AS read_only",
              )
            ).rows[0]!,
        ),
      );
      expect(identities[0]!.pid).not.toBe(identities[1]!.pid);
      expect(identities.map(({ read_only }) => read_only)).toEqual([
        'on',
        'on',
      ]);
      await expect(
        assertSamePostgresDatabase(first, second),
      ).resolves.toBeUndefined();
      expect(
        (
          await first.query(
            "SELECT count(*)::int AS held FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'",
          )
        ).rows,
      ).toEqual([{ held: 1 }]);
      expect(
        (
          await second.query(
            "SELECT count(*)::int AS held FROM pg_locks WHERE pid = pg_backend_pid() AND locktype = 'advisory'",
          )
        ).rows,
      ).toEqual([{ held: 0 }]);
    });
  });

  it('refuses independent databases on the same server', async () => {
    await checkPair(1, async (first, second) => {
      await expect(assertSamePostgresDatabase(first, second)).rejects.toThrow(
        'POSTGRES_DATABASES_DO_NOT_MATCH',
      );
    });
  });

  it('refuses accidentally reusing one backend for both roles', async () => {
    await checkPair(0, async (first) => {
      await expect(assertSamePostgresDatabase(first, first)).rejects.toThrow(
        'POSTGRES_DATABASES_DO_NOT_MATCH',
      );
    });
  });

  it('refuses a first connection outside its required transaction', async () => {
    await checkPair(0, async (first, second) => {
      await first.query('ROLLBACK');
      await expect(assertSamePostgresDatabase(first, second)).rejects.toThrow(
        'POSTGRES_DATABASES_DO_NOT_MATCH',
      );
    });
  });
});
