import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { createPool } from '../../db/pool.ts';
import { type DbEnv, isLocalDatabase, readEnv } from '../../env.ts';

const PROBE_TIMEOUT_MS = 3000;

export async function reachableDb(): Promise<DbEnv | null> {
  const { db } = readEnv();
  // Local only, the same refusal scripts/db-reset.ts makes: these suites run
  // garbage collection's unqualified DELETEs.
  if (!db || !isLocalDatabase(db.url)) return null;
  const pool = createPool(db);
  let timer: NodeJS.Timeout | undefined;
  try {
    const probe = pool.query('SELECT 1');
    // When the timeout wins the race, this query is still in flight and
    // `pool.end()` below rejects it. Promise.race has already settled by then,
    // so nothing is listening — and an unhandled rejection fails the run.
    probe.catch(() => undefined);
    await Promise.race([
      probe,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('probe timeout')),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    return db;
  } catch {
    return null;
  } finally {
    // Otherwise the timer keeps the suite alive for the rest of its window.
    clearTimeout(timer);
    await pool.end();
  }
}

/**
 * An isolated Postgres schema with its own pool. Suites that write a
 * deliberately wrong fingerprint need this: doing that in the shared
 * `studio_dev` would leave the developer's next `pnpm dev` refusing to boot.
 * Every statement in the composed schema is unqualified — tables, plpgsql
 * functions, and the triggers that bind to them — so all of it lands here.
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
  // The timeout turns a leaked client into a fast failure rather than a hang.
  const pool = new pg.Pool({
    connectionString: db.url,
    options: `-c search_path=${name}`,
    max: 20,
    connectionTimeoutMillis: 10_000,
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
