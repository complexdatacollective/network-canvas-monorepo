import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { createPool } from '../../db/pool.ts';
import { type DbEnv, readEnv } from '../../env.ts';

// The reachability probe every database suite opens with, extracted rather
// than copied a fourth time. Returns the resolved DbEnv so callers get their
// narrowing from the same call that decides whether to skip.

const PROBE_TIMEOUT_MS = 3000;

export async function reachableDb(): Promise<DbEnv | null> {
  const { db } = readEnv();
  if (!db) return null;
  const pool = createPool(db);
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS),
      ),
    ]);
    return db;
  } catch {
    return null;
  } finally {
    await pool.end();
  }
}

/**
 * An isolated Postgres schema with its own pool. Suites that write a
 * deliberately wrong fingerprint need this: doing that in the shared
 * `studio_dev` would leave the developer's next `pnpm dev` refusing to boot.
 * Every statement in AUTH_SCHEMA_SQL is unqualified, so it lands here.
 */
export async function createScratchSchema(
  db: DbEnv,
): Promise<{ pool: pg.Pool; dispose: () => Promise<void> }> {
  const name = `studio_test_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

  const admin = createPool(db);
  try {
    await admin.query(`create schema "${name}"`);
  } finally {
    await admin.end();
  }

  // Not createPool: the search_path is the whole point, and the server's pool
  // deliberately never carries one.
  const pool = new pg.Pool({
    connectionString: db.url,
    options: `-c search_path=${name}`,
  });

  return {
    pool,
    dispose: async () => {
      await pool.end();
      const cleanup = createPool(db);
      try {
        await cleanup.query(`drop schema if exists "${name}" cascade`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
