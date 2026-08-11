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

export async function applyAuthSchema(pool: pg.Pool): Promise<void> {
  await pool.query(AUTH_SCHEMA_SQL);
}
