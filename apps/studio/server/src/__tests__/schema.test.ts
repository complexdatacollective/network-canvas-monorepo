import { readFileSync } from 'node:fs';

import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import {
  ensureSchema,
  type StaleSchema,
  staleSchemaMessage,
} from '../db/schema.ts';
import { createScratchSchema, reachableDb } from './support/postgres.ts';

// The fingerprint guard: what stops an edited AUTH_SCHEMA_SQL from booting
// clean against a database that predates the edit. Each case runs in its own
// Postgres schema, because half of them corrupt the fingerprint on purpose.

const db = await reachableDb();

describe.skipIf(!db)('schema fingerprint', () => {
  async function withScratch(
    run: (pool: pg.Pool) => Promise<void>,
  ): Promise<void> {
    if (!db) throw new Error('unreachable: probe guaranteed db');
    const scratch = await createScratchSchema(db);
    try {
      await run(scratch.pool);
    } finally {
      await scratch.dispose();
    }
  }

  it('creates the schema and records a fingerprint on a fresh database', async () => {
    await withScratch(async (pool) => {
      expect(await ensureSchema(pool)).toEqual({ kind: 'created' });

      const tables = await pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables
         where table_schema = current_schema()`,
      );
      expect(tables.rows.map((r) => r.table_name).toSorted()).toEqual([
        'account',
        'rateLimit',
        'schemaFingerprint',
        'session',
        'user',
        'verification',
      ]);

      const recorded = await pool.query('select * from "schemaFingerprint"');
      expect(recorded.rowCount).toBe(1);
    });
  });

  it('reports current without re-applying or re-recording', async () => {
    await withScratch(async (pool) => {
      await ensureSchema(pool);
      const before = await pool.query<{ appliedAt: Date }>(
        'select "appliedAt" from "schemaFingerprint"',
      );

      expect(await ensureSchema(pool)).toEqual({ kind: 'current' });

      const after = await pool.query<{ appliedAt: Date }>(
        'select "appliedAt" from "schemaFingerprint"',
      );
      expect(after.rows[0]?.appliedAt).toEqual(before.rows[0]?.appliedAt);
    });
  });

  it('detects a database built from different SQL', async () => {
    await withScratch(async (pool) => {
      await ensureSchema(pool);
      await pool.query('update "schemaFingerprint" set "fingerprint" = $1', [
        'deadbeef'.repeat(8),
      ]);

      const state = await ensureSchema(pool);
      expect(state.kind).toBe('stale');
      expect(state).toMatchObject({
        reason: 'mismatch',
        found: 'deadbeef'.repeat(8),
      });
    });
  });

  it('refuses a database carrying the tables with no fingerprint', async () => {
    await withScratch(async (pool) => {
      await ensureSchema(pool);
      await pool.query('drop table "schemaFingerprint"');

      expect(await ensureSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'unstamped',
        found: null,
      });
    });
  });

  it('serialises concurrent application', async () => {
    await withScratch(async (pool) => {
      const states = await Promise.all([
        ensureSchema(pool),
        ensureSchema(pool),
      ]);

      expect(states.map((s) => s.kind).toSorted()).toEqual([
        'created',
        'current',
      ]);
      const recorded = await pool.query('select * from "schemaFingerprint"');
      expect(recorded.rowCount).toBe(1);
    });
  });
});

// Runs without a database: the guard's remedy is only useful if the command it
// names still exists.
describe('stale schema message', () => {
  const stale: StaleSchema = {
    kind: 'stale',
    reason: 'mismatch',
    found: 'a'.repeat(64),
    appliedAt: new Date('2026-08-13T00:00:00.000Z'),
  };

  it('names a script package.json declares', () => {
    const message = staleSchemaMessage(stale);
    expect(message).toContain('pnpm --filter @codaco/studio-server db:reset');

    const manifest = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(manifest.scripts).toHaveProperty('db:reset');
  });

  it('explains an unstamped database differently', () => {
    expect(staleSchemaMessage({ ...stale, reason: 'unstamped' })).toContain(
      'no fingerprint',
    );
  });
});
