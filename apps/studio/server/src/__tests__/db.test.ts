import { describe, expect, it } from 'vitest';

import { createPool } from '../db/pool.ts';
import { reachableDb } from './support/postgres.ts';

// Environment resolution is covered by src/env/__tests__/env.test.ts; what
// remains here is the integration probe.

// Integration probe against a real Postgres — the dev instance from
// scripts/dev-pg.ts (or whatever DATABASE_URL points at). Skips when no
// database is reachable, the same pattern as the asset-storage suite: unit
// lanes stay green without Docker; run the server's dev script to exercise
// this for real.

const db = await reachableDb();

describe.skipIf(!db)('postgres connectivity', () => {
  it('answers a round-trip query through the pool', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed db');
    const pool = createPool(db);
    try {
      const result = await pool.query('SELECT 1 AS one');
      expect(result.rows).toEqual([{ one: 1 }]);
    } finally {
      await pool.end();
    }
  });
});
