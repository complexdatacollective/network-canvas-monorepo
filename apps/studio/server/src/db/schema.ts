import { getTableName, sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type pg from 'pg';

import { SYNC_SIDECAR_SQL, SYNC_TABLES } from '@codaco/studio-sync/schema';

import { PROTOCOL_SIDECAR_SQL, PROTOCOL_TABLES } from '../protocol/schema.ts';
import { AUTH_TABLES } from './auth-schema.ts';
import { SCHEMA_FINGERPRINT } from './fingerprint.generated.ts';

// Managed like every other table: push diffs the whole public schema, so an
// unmanaged stamp table would read as droppable.
const schemaFingerprint = pgTable(
  'schemaFingerprint',
  {
    id: boolean('id').primaryKey().default(true),
    fingerprint: text('fingerprint').notNull(),
    appliedAt: timestamp('appliedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check('schemaFingerprint_id_check', sql`${table.id}`)],
);

export const SCHEMA = {
  ...AUTH_TABLES,
  ...SYNC_TABLES,
  ...PROTOCOL_TABLES,
  schemaFingerprint,
};

export const SIDECARS = [SYNC_SIDECAR_SQL, PROTOCOL_SIDECAR_SQL];

// The stamp table is excluded from the unstamped probe: its presence alone
// says nothing about which build's tables sit beside it.
export const SCHEMA_TABLES = Object.values(SCHEMA)
  .map(getTableName)
  .filter((name) => name !== getTableName(schemaFingerprint));

export const SCHEMA_LOCK_KEY = 4021775688147129;

export type StaleSchema = {
  kind: 'stale';
  /** `unstamped` is a database carrying the tables but no fingerprint row. */
  reason: 'mismatch' | 'unstamped';
  found: string | null;
  appliedAt: Date | null;
};

export type SchemaState =
  | { kind: 'current' }
  /** A database with no Studio tables and no fingerprint: never provisioned. */
  | { kind: 'absent' }
  | StaleSchema;

export type SchemaProblem = Exclude<SchemaState, { kind: 'current' }>;

/**
 * Read-only verdict; application lives in scripts/apply.ts. A problem is
 * returned rather than thrown so callers can tell a verdict from a connection
 * failure: anything this throws is transient, and everything it returns is an
 * answer.
 */
export async function checkSchema(pool: pg.Pool): Promise<SchemaState> {
  const probe = await pool.query<{ stamped: boolean; tables: boolean }>(
    `select to_regclass('"schemaFingerprint"') is not null as stamped,
            ${SCHEMA_TABLES.map(
              (table) => `to_regclass('"${table}"') is not null`,
            ).join(' or ')} as tables`,
  );
  const { stamped, tables } = probe.rows[0] ?? {
    stamped: false,
    tables: false,
  };

  if (stamped) {
    const recorded = await pool.query<{
      fingerprint: string;
      appliedAt: Date;
    }>('select "fingerprint", "appliedAt" from "schemaFingerprint"');
    const row = recorded.rows[0];
    if (row) {
      if (row.fingerprint !== SCHEMA_FINGERPRINT) {
        return {
          kind: 'stale',
          reason: 'mismatch',
          found: row.fingerprint,
          appliedAt: row.appliedAt,
        };
      }
      return { kind: 'current' };
    }
  }

  // Tables but no fingerprint: adopting it would launder exactly the
  // staleness this exists to catch.
  if (tables) {
    return { kind: 'stale', reason: 'unstamped', found: null, appliedAt: null };
  }

  return { kind: 'absent' };
}

export async function stampFingerprint(
  db: pg.Pool | pg.PoolClient,
  fingerprint: string,
): Promise<void> {
  await db.query(
    `insert into "schemaFingerprint" ("fingerprint") values ($1)
     on conflict ("id") do update set "fingerprint" = excluded."fingerprint", "appliedAt" = CURRENT_TIMESTAMP`,
    [fingerprint],
  );
}

export function schemaProblemMessage(state: SchemaProblem): string {
  if (state.kind === 'absent') {
    return [
      'The database has no Studio schema.',
      'Create it and start again:',
      '  pnpm --filter @codaco/studio-server db:reset        (local development)',
      '  pnpm --filter @codaco/studio-server apply-schema    (a deployed database)',
    ].join('\n');
  }

  const detail =
    state.reason === 'unstamped'
      ? 'The database carries Studio tables but no fingerprint, so the SQL that built it is unknown.'
      : `Expected ${SCHEMA_FINGERPRINT.slice(0, 12)}, found ${state.found?.slice(0, 12)} recorded ${state.appliedAt?.toISOString()}.`;

  return [
    'The database was not built from the schema in this build.',
    detail,
    'Studio has no migration system yet: pre-release, drizzle-kit push reconciles the schema in place, or recreate the database.',
    'Then start again:',
    '  pnpm --filter @codaco/studio-server apply-schema    (reconcile in place)',
    '  pnpm --filter @codaco/studio-server db:reset        (recreate)',
  ].join('\n');
}
