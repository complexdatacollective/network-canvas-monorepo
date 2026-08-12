import { fileURLToPath } from 'node:url';

import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { runMigrations } from '../db/migrate.ts';
import { DEV } from '../env/catalogue.ts';

// The committed migrations in drizzle/ against a real Postgres — the dev
// instance from scripts/dev-pg.ts. Runs in a scratch database (created and
// dropped here) so the shared studio_dev database's state never affects the
// assertion: what this proves is that a fresh deployment's boot produces
// the full schema, twice over (the journal makes re-runs no-ops). Skips
// when no Postgres is reachable, the same pattern as the connectivity suite.

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../drizzle', import.meta.url),
);
const SCRATCH_DATABASE = 'studio_migrations_test';

function adminClient(database = 'postgres'): pg.Client {
  return new pg.Client({
    host: '127.0.0.1',
    port: DEV.pgPort,
    user: DEV.pgUser,
    password: DEV.pgPassword,
    database,
    connectionTimeoutMillis: 3000,
  });
}

async function dbReachable(): Promise<boolean> {
  const client = adminClient();
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const reachable = await dbReachable();

describe.skipIf(!reachable)('database migrations', () => {
  it('builds the full schema on a fresh database, idempotently', async () => {
    const admin = adminClient();
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`);
      await admin.query(`CREATE DATABASE ${SCRATCH_DATABASE}`);

      const pool = new pg.Pool({
        host: '127.0.0.1',
        port: DEV.pgPort,
        user: DEV.pgUser,
        password: DEV.pgPassword,
        database: SCRATCH_DATABASE,
      });
      try {
        await runMigrations(pool, MIGRATIONS_FOLDER);
        // A second run must be a no-op: boot migrates unconditionally.
        await runMigrations(pool, MIGRATIONS_FOLDER);

        const tables = await pool.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public'`,
        );
        expect(tables.rows.map((row) => row.table_name).toSorted()).toEqual([
          'account',
          'rateLimit',
          'session',
          'user',
          'verification',
        ]);

        const indexes = await pool.query<{ indexname: string }>(
          `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
        );
        const names = indexes.rows.map((row) => row.indexname);
        expect(names).toContain('session_userId_idx');
        expect(names).toContain('account_userId_idx');
        expect(names).toContain('verification_identifier_idx');
      } finally {
        await pool.end();
      }
    } finally {
      await admin
        .query(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`)
        .catch(() => undefined);
      await admin.end();
    }
  });
});
