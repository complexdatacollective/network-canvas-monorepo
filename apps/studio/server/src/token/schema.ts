import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { teamIsolationPolicy, tenantTablesSql } from '@codaco/studio-sync/rls';

import { STUDY_TABLES } from '../study/schema.ts';

const { studies } = STUDY_TABLES;

// A team-owned service token: a scoped, long-lived API key issued to the
// team rather than to a person. The presented secret is never stored, only
// its sha256. The principal a token resolves to is defined entirely by its own
// columns — `scope_kind`, `study_id`, `access_level` and `includes_pii` — and
// never by intersection with any user's live RBAC, so a token's authority is
// readable from the row and cannot drift as team membership changes. The
// accountable human is the custodian, which is why revoking a departing
// researcher's access means reassigning or revoking their tokens explicitly.
const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    name: text('name').notNull(),
    // The named human accountable for this service token: who to ask, and
    // whose departure triggers reassignment rather than silent breakage.
    custodianUserId: text('custodian_user_id').notNull(),
    // The non-secret display and lookup prefix, e.g. `ncs_live_a1b2c3d4`.
    // Indexed so a presented bearer token is a single-row probe.
    tokenPrefix: text('token_prefix').notNull(),
    // sha256 hex of the 256-bit CSPRNG secret. A fast hash is correct here
    // and a slow one is wrong: the secret has full entropy (no dictionary
    // risk) and is verified on every API request.
    tokenHash: text('token_hash').notNull(),
    scopeKind: text('scope_kind').notNull(),
    studyId: uuid('study_id'),
    accessLevel: text('access_level').notNull(),
    includesPii: boolean('includes_pii').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: text('revoked_by_user_id'),
    createdByUserId: text('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    uniqueIndex('api_tokens_token_hash_idx').on(table.tokenHash),
    uniqueIndex('api_tokens_token_prefix_idx').on(table.tokenPrefix),
    index('api_tokens_team_id_created_at_idx').on(
      table.teamId,
      table.createdAt.desc(),
    ),
    foreignKey({
      name: 'api_tokens_study_fk',
      columns: [table.studyId, table.teamId],
      foreignColumns: [studies.id, studies.teamId],
    }),
    check(
      'api_tokens_scope_kind_check',
      sql`${table.scopeKind} IN ('team', 'study')
          AND (${table.scopeKind} = 'study') = (${table.studyId} IS NOT NULL)`,
    ),
    check(
      'api_tokens_access_level_check',
      sql`${table.accessLevel} IN ('read', 'write')`,
    ),
    check(
      'api_tokens_revocation_check',
      sql`(${table.revokedAt} IS NULL) = (${table.revokedByUserId} IS NULL)`,
    ),
    check(
      'api_tokens_token_hash_check',
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'api_tokens_token_prefix_check',
      sql`${table.tokenPrefix} ~ '^[a-z0-9_]{8,40}$'`,
    ),
    check(
      'api_tokens_name_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 120
          AND ${table.name} ~ '[^[:space:]]'`,
    ),
    check(
      'api_tokens_actor_lengths_check',
      sql`char_length(${table.createdByUserId}) BETWEEN 1 AND 255
          AND char_length(${table.custodianUserId}) BETWEEN 1 AND 255
          AND (${table.revokedByUserId} IS NULL OR char_length(${table.revokedByUserId}) BETWEEN 1 AND 255)`,
    ),
    teamIsolationPolicy(),
  ],
);

export const TOKEN_TABLES = { apiTokens };

// Hashed into the schema fingerprint — whitespace counts. CREATE OR REPLACE
// because DROP TABLE CASCADE leaves functions behind, and an `already exists`
// error reads as transient to the boot retry loop.
export const TOKEN_SIDECAR_SQL = `
-- A token's secret and authority are fixed at issue. Rotation is a new
-- token; widening scope is a new token. Only usage evidence, custodianship
-- and revocation move, and revocation is one-way.
CREATE OR REPLACE FUNCTION api_token_authority_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'api token authority is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER api_token_authority_immutable
  BEFORE UPDATE ON api_tokens
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.token_prefix IS DISTINCT FROM OLD.token_prefix
    OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
    OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
    OR NEW.study_id IS DISTINCT FROM OLD.study_id
    OR NEW.access_level IS DISTINCT FROM OLD.access_level
    OR NEW.includes_pii IS DISTINCT FROM OLD.includes_pii
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
  )
  EXECUTE FUNCTION api_token_authority_is_immutable();
${tenantTablesSql(['api_tokens'])}
`;
