import { describe, expect, it } from 'vitest';

import { createPool } from '../db/pool.ts';
import { readEnv } from '../env.ts';

// Environment resolution is covered by src/env/__tests__/env.test.ts; what
// remains here is the integration probe.

// Integration probe against a real Postgres — the dev instance from
// scripts/dev-pg.ts (or whatever DATABASE_URL points at). Skips when no
// database is reachable, the same pattern as the asset-storage suite: unit
// lanes stay green without Docker; run the server's dev script to exercise
// this for real.

const env = readEnv();

async function dbReachable(): Promise<boolean> {
  if (!env.db) return false;
  const pool = createPool(env.db);
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('probe timeout')), 3000),
      ),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

const reachable = await dbReachable();

describe.skipIf(!reachable)('postgres connectivity', () => {
  it('answers a round-trip query through the pool', async () => {
    if (!env.db) throw new Error('unreachable: probe guaranteed env.db');
    const pool = createPool(env.db);
    try {
      const result = await pool.query('SELECT 1 AS one');
      expect(result.rows).toEqual([{ one: 1 }]);
    } finally {
      await pool.end();
    }
  });
});
