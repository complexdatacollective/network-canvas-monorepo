import { describe, expect, it } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import { createPool } from '../db/pool.ts';
import { reachableDb } from './support/postgres.ts';

// Skips when no database is reachable: unit lanes stay green without Docker;
// run the server's dev script to exercise this for real.

const db = await reachableDb();

describe.skipIf(!db)('the application pool', () => {
  it('runs every query as the application role', async () => {
    if (!db) throw new Error('unreachable: probe guaranteed db');
    const pool = createPool(db);
    try {
      const result = await pool.query<{ role: string }>(
        'SELECT current_user AS role',
      );
      expect(result.rows).toEqual([{ role: TENANT_ROLES.app }]);
    } finally {
      await pool.end();
    }
  });
});
