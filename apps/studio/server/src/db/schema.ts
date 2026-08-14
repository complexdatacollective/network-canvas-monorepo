import { createHash } from 'node:crypto';

import type pg from 'pg';

// better-auth's tables (users, cookie sessions, provider accounts,
// verification tokens) plus the Postgres-backed rate-limit counters (#1246:
// durable security counters live in Postgres, never memory or Redis).
//
// Snapshotted from `npx -y @better-auth/cli@latest generate --config
// scripts/auth-cli-config.ts` (CLI 1.4.22 at snapshot time — the CLI
// versions independently of better-auth itself) and made idempotent, the
// same shape as
// packages/studio-sync's SCHEMA_SQL. There is deliberately no migration
// system yet: pre-release, a schema change means wiping the database and
// letting boot recreate it. Real migrations (Drizzle, per #1246's direction)
// must land before a release carries data worth keeping. On a better-auth
// version bump: re-run generate against an empty database, diff against
// this, and update.
const AUTH_SCHEMA_SQL = `
create table if not exists "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table if not exists "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);

create table if not exists "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table if not exists "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table if not exists "rateLimit" ("id" text not null primary key, "key" text not null unique, "count" integer not null, "lastRequest" bigint not null);

create index if not exists "session_userId_idx" on "session" ("userId");

create index if not exists "account_userId_idx" on "account" ("userId");

create index if not exists "verification_identifier_idx" on "verification" ("identifier");
`;

// Every table the SQL above owns. Kept beside it because the unstamped probe
// below has to ask about all of them: finding any one is enough to know the
// database was built by something other than this build.
export const SCHEMA_TABLES = [
  'user',
  'session',
  'account',
  'verification',
  'rateLimit',
] as const;

// Every statement above is `if not exists`, so applying it to a database that
// already has the tables succeeds while changing nothing — a stale schema
// would boot clean and fail later inside better-auth. The fingerprint is the
// detector: the hash of the SQL that built a database, recorded in it.
//
// This table's own DDL is deliberately outside the hashed string, because the
// fingerprint has to be readable before we decide whether to apply the schema.
// It is therefore unguarded, and must stay frozen.
const FINGERPRINT_TABLE_SQL = `
create table if not exists "schemaFingerprint" ("id" boolean primary key default true check ("id"), "fingerprint" text not null, "appliedAt" timestamptz default CURRENT_TIMESTAMP not null);
`;

// Whitespace counts. Reformatting the template literal above reads as a schema
// change and demands a wipe; normalising first would be cleverness the next
// reader has to take on trust.
const SCHEMA_FINGERPRINT = createHash('sha256')
  .update(AUTH_SCHEMA_SQL)
  .digest('hex');

// `create table if not exists` is not concurrency-safe in Postgres — parallel
// executions race on pg_type and one raises a duplicate-key error — and every
// replica of a scaled-out deployment applies the schema at boot.
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
  await client.query(AUTH_SCHEMA_SQL);
}

/**
 * The only way a database comes to have this schema. A mismatch is returned
 * rather than thrown so callers can tell a verdict from a connection failure:
 * anything this throws is transient, and everything it returns is an answer.
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
