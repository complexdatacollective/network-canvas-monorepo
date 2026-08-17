import { createHash } from 'node:crypto';

import type pg from 'pg';

import { SCHEMA_SQL as SYNC_SCHEMA_SQL } from '@codaco/studio-sync/schema';

import { PROTOCOL_STORE_SCHEMA_SQL } from '../protocol/schema.ts';
import { AUTH_SCHEMA_SQL } from './auth-schema.ts';

// One database, one schema, one fingerprint. The three blocks live with their
// owners — better-auth's generated tables in ./auth-schema.ts, the sync
// engine's in @codaco/studio-sync, the protocol store's in ../protocol — and
// are composed here because Studio applies them together or not at all.
//
// The order is load-bearing: version_sections.section_hash has a foreign key
// into the sync engine's sections, and protocol_drafts.draft_id into its
// drafts.
const SCHEMA_SQL = [
  AUTH_SCHEMA_SQL,
  SYNC_SCHEMA_SQL,
  PROTOCOL_STORE_SCHEMA_SQL,
].join('\n');

// The unstamped probe below reads this list; finding any one table is enough
// to know the database was built by something other than this build.
export const SCHEMA_TABLES = [
  // ./auth-schema.ts
  'user',
  'session',
  'account',
  'verification',
  'rateLimit',
  // @codaco/studio-sync/schema
  'drafts',
  'sections',
  'manifests',
  'leases',
  'command_log',
  // ../protocol/schema.ts
  'protocols',
  'protocol_versions',
  'version_sections',
  'protocol_drafts',
] as const;

// The auth block is `if not exists` throughout, so applying it to a database
// that already has the tables succeeds while changing nothing — a stale schema
// would boot clean and fail later inside better-auth. The fingerprint is the
// detector: the hash of the SQL that built a database, recorded in it.
//
// This table's own DDL is deliberately outside the hashed string, because the
// fingerprint has to be readable before we decide whether to apply the schema.
// It is therefore unguarded, and must stay frozen.
const FINGERPRINT_TABLE_SQL = `
create table if not exists "schemaFingerprint" ("id" boolean primary key default true check ("id"), "fingerprint" text not null, "appliedAt" timestamptz default CURRENT_TIMESTAMP not null);
`;

// Whitespace counts, in all three composed blocks. Reformatting any of them
// reads as a schema change and demands a wipe; normalising first would be
// cleverness the next reader has to take on trust.
const SCHEMA_FINGERPRINT = createHash('sha256')
  .update(SCHEMA_SQL)
  .digest('hex');

// `create table if not exists` is not concurrency-safe in Postgres — parallel
// executions race on pg_type and one raises a duplicate-key error — and every
// replica of a scaled-out deployment applies the schema at boot.
//
// The sync and protocol blocks are not idempotent at all (bare `CREATE TABLE`),
// which is safe only because applySchema runs solely when the fingerprint row
// is absent AND the SCHEMA_TABLES probe finds nothing — both inside this lock.
const SCHEMA_LOCK_KEY = 4021775688147129;

export type StaleSchema = {
  kind: 'stale';
  /** `unstamped` is a database carrying the tables but no fingerprint row. */
  reason: 'mismatch' | 'unstamped';
  found: string | null;
  appliedAt: Date | null;
};

export type SchemaState =
  | { kind: 'created' }
  | { kind: 'current' }
  | StaleSchema;

async function applySchema(client: pg.PoolClient): Promise<void> {
  await client.query(SCHEMA_SQL);
}

/**
 * A mismatch is returned rather than thrown so callers can tell a verdict from
 * a connection failure: anything this throws is transient, and everything it
 * returns is an answer.
 */
export async function ensureSchema(pool: pg.Pool): Promise<SchemaState> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`select pg_advisory_xact_lock(${SCHEMA_LOCK_KEY})`);
    await client.query(FINGERPRINT_TABLE_SQL);

    const recorded = await client.query<{
      fingerprint: string;
      appliedAt: Date;
    }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');
    const row = recorded.rows[0];

    if (row) {
      if (row.fingerprint !== SCHEMA_FINGERPRINT) {
        await client.query('rollback');
        return {
          kind: 'stale',
          reason: 'mismatch',
          found: row.fingerprint,
          appliedAt: row.appliedAt,
        };
      }
      await client.query('commit');
      return { kind: 'current' };
    }

    // Tables but no fingerprint: either a database predating this guard or one
    // built from older SQL, and the two are indistinguishable. Recording the
    // current hash would launder exactly the staleness this exists to catch,
    // so it refuses — the one-time wipe is what the no-migrations posture
    // already asks for.
    const probe = await client.query<{ present: boolean }>(
      `select ${SCHEMA_TABLES.map(
        (table) => `to_regclass('"${table}"') is not null`,
      ).join(' or ')} as present`,
    );
    if (probe.rows[0]?.present) {
      await client.query('rollback');
      return {
        kind: 'stale',
        reason: 'unstamped',
        found: null,
        appliedAt: null,
      };
    }

    await applySchema(client);
    await client.query(
      'insert into "schemaFingerprint" ("fingerprint") values ($1)',
      [SCHEMA_FINGERPRINT],
    );
    await client.query('commit');
    return { kind: 'created' };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function staleSchemaMessage(state: StaleSchema): string {
  const detail =
    state.reason === 'unstamped'
      ? 'The database carries Studio tables but no fingerprint, so the SQL that built it is unknown.'
      : `Expected ${SCHEMA_FINGERPRINT.slice(0, 12)}, found ${state.found?.slice(0, 12)} recorded ${state.appliedAt?.toISOString()}.`;

  return [
    'The database was not built from the schema in this build.',
    detail,
    'Studio has no migration system yet: pre-release, a schema change means recreating the database.',
    'Recreate it and start again:',
    '  pnpm --filter @codaco/studio-server db:reset',
  ].join('\n');
}
