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
} from 'drizzle-orm/pg-core';

export const registryAuthUser = pgTable('registry_auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

const session = pgTable(
  'registry_auth_session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => registryAuthUser.id, { onDelete: 'cascade' }),
  },
  (table) => [index('registry_auth_session_user_idx').on(table.userId)],
);

// Better Auth's magic-link promotion clears account links for a pre-existing
// unverified user. Keep that query available, but permit no account rows or
// password/OAuth credential columns in this email-only service.
const account = pgTable(
  'registry_auth_account',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => registryAuthUser.id, { onDelete: 'cascade' }),
  },
  () => [check('registry_auth_account_disabled', sql`false`)],
);

const verification = pgTable(
  'registry_auth_verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('registry_auth_verification_identifier_idx').on(table.identifier),
  ],
);

const rateLimit = pgTable('registry_auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

export const REGISTRY_AUTH_TABLES = {
  user: registryAuthUser,
  session,
  account,
  verification,
  rateLimit,
};
