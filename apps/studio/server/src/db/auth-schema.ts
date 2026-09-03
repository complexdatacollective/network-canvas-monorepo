// On a better-auth bump: `npx -y @better-auth/cli@latest generate --config
// scripts/auth-cli-config.ts`, diff, and fold in changes without altering
// existing physical names or types.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull(),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activeTeamId: text('activeTeamId'),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
);

const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    // Who vouches for `accountId`: `local:credential` for email/password,
    // `https://accounts.google.com` for Google, the id token's per-tenant
    // `iss` for Microsoft. better-auth 1.7 keys every account lookup
    // (findCredentialAccount, findAccountByKey) on (issuer, accountId), so
    // omitting the column made every credential and OAuth account
    // unmatchable while looking otherwise fine — magic-link, the only path
    // exercised until #1256's admin account, creates no account row at all.
    issuer: text('issuer').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
  },
  // (issuer, accountId) is the external identity better-auth's own schema
  // declares unique; without it two concurrent sign-ins for one identity can
  // each insert a row, after which lookups pick one arbitrarily.
  (table) => [
    uniqueIndex('account_issuer_accountId_idx').on(
      table.issuer,
      table.accountId,
    ),
    index('account_userId_idx').on(table.userId),
  ],
);

const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

const rateLimit = pgTable('rateLimit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('lastRequest', { mode: 'number' }).notNull(),
});

// The organization plugin's tables, renamed to domain vocabulary via the
// plugin's schema overrides in src/auth/better-auth.ts (#1249). Property keys
// are snake_case because the drizzle adapter resolves overridden field names
// against them.
export const teams = pgTable(
  'teams',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    metadata: text('metadata'),
  },
  (table) => [
    check('teams_name_nonblank_check', sql`${table.name} ~ '[^[:space:]]'`),
  ],
);

const team_members = pgTable(
  'team_members',
  {
    id: text('id').primaryKey(),
    team_id: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // A user holds at most one membership per team, enforced here because the
  // plugin only check-then-inserts: it keeps getMembership's single-row read
  // unambiguous. The unique index subsumes the generated single-column team_id
  // index; the reversed composite serves "teams for this user".
  (table) => [
    uniqueIndex('team_members_team_id_user_id_idx').on(
      table.team_id,
      table.user_id,
    ),
    index('team_members_user_id_team_id_idx').on(table.user_id, table.team_id),
  ],
);

const team_invitations = pgTable(
  'team_invitations',
  {
    id: text('id').primaryKey(),
    team_id: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').default('pending').notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    inviter_id: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // Supports the composite outbox FK, which proves a queued delivery's
    // team_id belongs to its invitation rather than merely trusting a caller.
    uniqueIndex('team_invitations_id_team_id_idx').on(table.id, table.team_id),
    index('team_invitations_team_id_idx').on(table.team_id),
    index('team_invitations_email_idx').on(table.email),
  ],
);

export const AUTH_TABLES = {
  user,
  session,
  account,
  verification,
  rateLimit,
  teams,
  team_members,
  team_invitations,
};
