import { getTableName, sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import type pg from 'pg';

import { SYNC_SIDECAR_SQL, SYNC_TABLES } from '@codaco/studio-sync/schema';

import { AUDIT_SIDECAR_SQL, AUDIT_TABLES } from '../audit/schema.ts';
import { PROTOCOL_SIDECAR_SQL, PROTOCOL_TABLES } from '../protocol/schema.ts';
import {
  INVITATION_DELIVERY_SIDECAR_SQL,
  INVITATION_DELIVERY_TABLES,
} from '../team/invitation-delivery-schema.ts';
import { ACCESS_SIDECAR_SQL } from './access.ts';
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
  ...AUDIT_TABLES,
  ...INVITATION_DELIVERY_TABLES,
  schemaFingerprint,
};

// Order matters: sync creates the roles, access grants the general table
// privileges, then the invitation outbox and immutable audit log apply their
// narrower role-specific revocations after every broad grant.
export const SIDECARS = [
  SYNC_SIDECAR_SQL,
  PROTOCOL_SIDECAR_SQL,
  ACCESS_SIDECAR_SQL,
  INVITATION_DELIVERY_SIDECAR_SQL,
  AUDIT_SIDECAR_SQL,
];

// The stamp table is excluded from the unstamped probe: its presence alone
// says nothing about which build's tables sit beside it.
export const SCHEMA_TABLES = Object.values(SCHEMA)
  .map(getTableName)
  .filter((name) => name !== getTableName(schemaFingerprint));

export const SCHEMA_LOCK_KEY = 4021775688147129;

// Runs under the schema advisory lock before drizzle-kit reconciles new
// constraints. Each block repairs rows an older build wrote so the database
// can begin enforcing the current contract; each is a no-op on a fresh
// database (the to_regclass guard) and on a current one (the predicates).
export const PRE_PUSH_MIGRATIONS = [
  // Better Auth formerly accepted whitespace-only organization names.
  `DO $$ BEGIN
    IF to_regclass('"teams"') IS NOT NULL THEN
      UPDATE teams
      SET name = 'Team ' || id
      WHERE name !~ '[^[:space:]]';
    END IF;
  END $$;`,
  // account.issuer arrived with better-auth 1.7 and is required. Postgres
  // refuses to add a NOT NULL column to a populated table, and better-auth's
  // own migrator refuses the same, so the column is added nullable here and
  // filled the way each provider would have: the credential and Google
  // issuers are fixed strings, Microsoft's is the id token's per-tenant
  // `iss`, decoded from the stored token. A row whose issuer still cannot be
  // recovered gets better-auth's synthetic default for an issuer-less
  // provider; it never matches a real sign-in, which relinks the account.
  // push then sets NOT NULL and adds the unique index over filled rows.
  `DO $$
  DECLARE
    r record;
    payload text;
    iss text;
  BEGIN
    IF to_regclass('"account"') IS NULL THEN
      RETURN;
    END IF;
    ALTER TABLE account ADD COLUMN IF NOT EXISTS issuer text;
    UPDATE account SET issuer = 'local:credential'
      WHERE issuer IS NULL AND "providerId" = 'credential';
    UPDATE account SET issuer = 'https://accounts.google.com'
      WHERE issuer IS NULL AND "providerId" = 'google';
    FOR r IN
      SELECT id, "idToken" FROM account
      WHERE issuer IS NULL AND "idToken" IS NOT NULL
    LOOP
      BEGIN
        payload := translate(split_part(r."idToken", '.', 2), '-_', '+/');
        payload := rpad(payload, ((length(payload) + 3) / 4) * 4, '=');
        iss := convert_from(decode(payload, 'base64'), 'UTF8')::jsonb ->> 'iss';
        IF iss <> '' THEN
          UPDATE account SET issuer = iss WHERE id = r.id;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
    UPDATE account SET issuer = 'local:oauth:' || "providerId"
      WHERE issuer IS NULL;
  END $$;`,
] as const;

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
