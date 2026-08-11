import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPool } from '../db/pool.ts';
import { readEnv } from '../env.ts';

describe('database environment', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the dev Postgres outside production', () => {
    vi.stubEnv('DATABASE_URL', '');
    const env = readEnv();
    expect(env.db).toEqual({
      url: 'postgres://postgres:spike@127.0.0.1:54318/studio_dev',
    });
  });

  it('uses DATABASE_URL when set', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@db.internal:5432/studio');
    // An explicit DATABASE_URL marks a real deployment: the auth dev
    // defaults deactivate and this pair becomes mandatory.
    vi.stubEnv('BETTER_AUTH_SECRET', 'a'.repeat(40));
    vi.stubEnv('PUBLIC_URL', 'https://studio.example');
    const env = readEnv();
    expect(env.db).toEqual({ url: 'postgres://app@db.internal:5432/studio' });
  });

  it('refuses the dev auth secret once DATABASE_URL is explicit, regardless of NODE_ENV', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://app@db.internal:5432/studio');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    expect(() => readEnv()).toThrow(/BETTER_AUTH_SECRET is required/);
  });

  it('is unconfigured in production without DATABASE_URL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', '');
    const env = readEnv();
    expect(env.db).toBeUndefined();
  });
});

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
