import { readFileSync } from 'node:fs';

import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { applySchema, computeSchemaFingerprint } from '../../scripts/apply.ts';
import { SCHEMA_FINGERPRINT } from '../db/fingerprint.generated.ts';
import {
  checkSchema,
  SCHEMA_TABLES,
  type StaleSchema,
  schemaProblemMessage,
} from '../db/schema.ts';
import type { DbEnv } from '../env.ts';
import {
  createScratchDatabase,
  createScratchSchema,
  provisionScratchSchema,
  reachableDb,
} from './support/postgres.ts';

const db = await reachableDb();

function readManifestScripts(): Record<string, string> {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { scripts: Record<string, string> };
  return manifest.scripts;
}

describe('fingerprint constant', () => {
  it('matches the schema definitions', async () => {
    expect(
      await computeSchemaFingerprint(),
      'stale src/db/fingerprint.generated.ts; run: pnpm --filter @codaco/studio-server sync-fingerprint',
    ).toBe(SCHEMA_FINGERPRINT);
  });

  it('is resynced by a script package.json declares', () => {
    expect(readManifestScripts()).toHaveProperty('sync-fingerprint');
  });
});

async function withScratch(
  make: (db: DbEnv) => Promise<{ pool: pg.Pool; dispose: () => Promise<void> }>,
  run: (pool: pg.Pool) => Promise<void>,
): Promise<void> {
  if (!db) throw new Error('unreachable: probe guaranteed db');
  const scratch = await make(db);
  try {
    await run(scratch.pool);
  } finally {
    await scratch.dispose();
  }
}

// Each case runs in its own Postgres schema, because half of them corrupt the
// fingerprint on purpose.
describe.skipIf(!db)('schema verification', () => {
  it('reads current on a provisioned schema carrying every table', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);

      expect(await checkSchema(pool)).toEqual({ kind: 'current' });

      const tables = await pool.query<{ table_name: string }>(
        `select table_name from information_schema.tables
         where table_schema = current_schema()`,
      );
      expect(tables.rows.map((r) => r.table_name).toSorted()).toEqual([
        'account',
        'command_log',
        'drafts',
        'leases',
        'manifests',
        'protocol_drafts',
        'protocol_versions',
        'protocols',
        'rateLimit',
        'schemaFingerprint',
        'sections',
        'session',
        'team_invitations',
        'team_members',
        'teams',
        'user',
        'verification',
        'version_sections',
      ]);
      expect([...SCHEMA_TABLES].toSorted()).toEqual(
        tables.rows
          .map((r) => r.table_name)
          .filter((name) => name !== 'schemaFingerprint')
          .toSorted(),
      );

      const recorded = await pool.query('select * from "schemaFingerprint"');
      expect(recorded.rowCount).toBe(1);
    });
  });

  it('reports a never-provisioned database as absent', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      expect(await checkSchema(pool)).toEqual({ kind: 'absent' });
    });
  });

  it('detects a database built from different SQL', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('update "schemaFingerprint" set "fingerprint" = $1', [
        'deadbeef'.repeat(8),
      ]);

      const state = await checkSchema(pool);
      expect(state.kind).toBe('stale');
      expect(state).toMatchObject({
        reason: 'mismatch',
        found: 'deadbeef'.repeat(8),
      });
    });
  });

  it('refuses a database carrying the tables with no fingerprint', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('drop table "schemaFingerprint"');

      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'unstamped',
        found: null,
      });
    });
  });

  it('treats an empty fingerprint table as unstamped', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('delete from "schemaFingerprint"');

      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'unstamped',
      });
    });
  });

  it('refuses an unstamped database that kept only some of the tables', async () => {
    await withScratch(createScratchSchema, async (pool) => {
      await provisionScratchSchema(pool);
      await pool.query('drop table "schemaFingerprint"');
      // Leaves "verification" and "rateLimit" behind: a database no longer
      // recognisable by the "user" table alone, but still not ours to stamp.
      await pool.query('drop table "user" cascade');

      expect(await checkSchema(pool)).toMatchObject({
        kind: 'stale',
        reason: 'unstamped',
      });
    });
  });
});

// drizzle-kit push introspects `public`, so these run in scratch databases.
describe.skipIf(!db)('schema application', () => {
  it('provisions and stamps a fresh database', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      const outcome = await applySchema(pool);
      expect(outcome.statements.length).toBeGreaterThan(0);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('is a no-op on a current database', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      const again = await applySchema(pool);
      expect(again.statements).toEqual([]);
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('reconciles a drifted database in place', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await applySchema(pool);
      await pool.query('alter table "protocols" drop column "name"');

      const outcome = await applySchema(pool);
      expect(outcome.statements.join('\n')).toContain('"name"');

      const columns = await pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'protocols'`,
      );
      expect(columns.rows.map((r) => r.column_name)).toContain('name');
      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
    });
  });

  it('serialises concurrent application', async () => {
    await withScratch(createScratchDatabase, async (pool) => {
      await Promise.all([applySchema(pool), applySchema(pool)]);

      expect(await checkSchema(pool)).toEqual({ kind: 'current' });
      const recorded = await pool.query('select * from "schemaFingerprint"');
      expect(recorded.rowCount).toBe(1);
    });
  });
});

describe('schema problem message', () => {
  const stale: StaleSchema = {
    kind: 'stale',
    reason: 'mismatch',
    found: 'a'.repeat(64),
    appliedAt: new Date('2026-08-13T00:00:00.000Z'),
  };

  it('names scripts package.json declares', () => {
    const message = schemaProblemMessage(stale);
    expect(message).toContain('pnpm --filter @codaco/studio-server db:reset');
    expect(message).toContain(
      'pnpm --filter @codaco/studio-server apply-schema',
    );

    const scripts = readManifestScripts();
    expect(scripts).toHaveProperty('db:reset');
    expect(scripts).toHaveProperty('apply-schema');
  });

  it('explains an unstamped database differently', () => {
    expect(schemaProblemMessage({ ...stale, reason: 'unstamped' })).toContain(
      'no fingerprint',
    );
  });

  it('explains an absent schema with both remedies', () => {
    const message = schemaProblemMessage({ kind: 'absent' });
    expect(message).toContain('pnpm --filter @codaco/studio-server db:reset');
    expect(message).toContain(
      'pnpm --filter @codaco/studio-server apply-schema',
    );
  });
});
