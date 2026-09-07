import { getTableName, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { escapeIdentifier } from 'pg';

import type { TemplateArtifactManifest } from '@codaco/studio-sync/template-exchange';
import type { TemplateMetadata } from '@codaco/studio-sync/template-metadata';

import { REGISTRY_AUTH_TABLES, registryAuthUser } from '../auth/schema.ts';

export const REGISTRY_ROLES = {
  app: 'registry_app',
  operator: 'registry_operator',
} as const;
export const REGISTRY_BACKUP_ROLE = 'registry_backup';
const time = (name: string) => timestamp(name, { withTimezone: true });

const schemaFingerprint = pgTable(
  'registry_schema_fingerprint',
  {
    id: boolean('id').primaryKey().default(true),
    fingerprint: text('fingerprint').notNull(),
    instanceId: uuid('instance_id').notNull().defaultRandom(),
    appliedAt: time('applied_at').notNull().defaultNow(),
  },
  (table) => [
    check('registry_schema_singleton_check', sql`${table.id} = true`),
    check(
      'registry_schema_fingerprint_check',
      sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

const publishers = pgTable(
  'registry_publishers',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => registryAuthUser.id),
    name: text('name').notNull(),
    orcid: text('orcid'),
    createdAt: time('created_at').notNull().defaultNow(),
    suspendedAt: time('suspended_at'),
  },
  (table) => [
    check(
      'registry_publisher_name_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 200 AND ${table.name} ~ '[^[:space:]]'`,
    ),
    check(
      'registry_publisher_orcid_check',
      sql`${table.orcid} IS NULL OR ${table.orcid} ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$'`,
    ),
  ],
);

const operators = pgTable('registry_operators', {
  userId: text('user_id')
    .primaryKey()
    .references(() => registryAuthUser.id),
  enabled: boolean('enabled').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
});

const credentials = pgTable(
  'registry_credentials',
  {
    id: uuid('id').primaryKey(),
    publisherId: uuid('publisher_id')
      .notNull()
      .references(() => publishers.id),
    tokenHash: text('token_hash').notNull().unique(),
    name: text('name').notNull(),
    scopes: text('scopes').array().notNull(),
    createdAt: time('created_at').notNull().defaultNow(),
    expiresAt: time('expires_at').notNull(),
    revokedAt: time('revoked_at'),
  },
  (table) => [
    index('registry_credentials_publisher_idx').on(table.publisherId),
    check(
      'registry_credentials_hash_check',
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'registry_credentials_scopes_check',
      sql`cardinality(${table.scopes}) BETWEEN 1 AND 2 AND ${table.scopes} <@ ARRAY['publish', 'moderate']::text[]`,
    ),
    check(
      'registry_credentials_name_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 100`,
    ),
    check(
      'registry_credentials_expiry_check',
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
  ],
);

// Stable non-content identity survives an operator erasure. Content itself is
// a separate immutable row, deleted with the object bytes during hard delete.
const artifacts = pgTable(
  'registry_artifacts',
  {
    root: text('root').primaryKey(),
    rawHash: text('raw_hash').notNull().unique(),
    byteSize: integer('byte_size').notNull(),
    createdAt: time('created_at').notNull().defaultNow(),
    blockedAt: time('blocked_at'),
    deletedAt: time('deleted_at'),
  },
  (table) => [
    check(
      'registry_artifact_hash_check',
      sql`${table.root} ~ '^[0-9a-f]{64}$' AND ${table.rawHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'registry_artifact_size_check',
      sql`${table.byteSize} BETWEEN 1 AND 26214400`,
    ),
    check(
      'registry_artifact_delete_check',
      sql`${table.deletedAt} IS NULL OR ${table.blockedAt} IS NOT NULL`,
    ),
  ],
);
const artifactContent = pgTable(
  'registry_artifact_content',
  {
    root: text('root')
      .primaryKey()
      .references(() => artifacts.root),
    template: jsonb('template')
      .$type<TemplateArtifactManifest['template']>()
      .notNull(),
    metadata: jsonb('metadata').$type<TemplateMetadata>().notNull(),
    license: text('license').notNull(),
  },
  (table) => [
    check(
      'registry_content_objects_check',
      sql`jsonb_typeof(${table.template}) = 'object' AND jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    check(
      'registry_content_license_check',
      sql`${table.license} IN ('CC-BY-4.0', 'CC0-1.0')`,
    ),
  ],
);

const entries = pgTable(
  'registry_entries',
  {
    id: uuid('id').primaryKey(),
    sequence: bigint('sequence', { mode: 'bigint' })
      .notNull()
      .generatedAlwaysAsIdentity(),
    publisherId: uuid('publisher_id')
      .notNull()
      .references(() => publishers.id),
    artifactRoot: text('artifact_root')
      .notNull()
      .references(() => artifacts.root),
    createdAt: time('created_at').notNull().defaultNow(),
    yankedAt: time('yanked_at'),
    curatedAt: time('curated_at'),
  },
  (table) => [
    unique('registry_entry_publisher_root_unique').on(
      table.publisherId,
      table.artifactRoot,
    ),
    unique('registry_entry_sequence_unique').on(table.sequence),
    index('registry_entry_artifact_idx').on(table.artifactRoot),
  ],
);

const audit = pgTable(
  'registry_audit',
  {
    id: uuid('id').primaryKey(),
    occurredAt: time('occurred_at')
      .notNull()
      .default(sql`statement_timestamp()`),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    subjectId: text('subject_id').notNull(),
    requestId: uuid('request_id').notNull(),
  },
  (table) => [
    check(
      'registry_audit_actor_kind_check',
      sql`${table.actorKind} IN ('publisher', 'operator', 'system', 'database_operator')`,
    ),
    check(
      'registry_audit_lengths_check',
      sql`char_length(${table.actorId}) BETWEEN 1 AND 255 AND char_length(${table.subjectId}) BETWEEN 1 AND 255`,
    ),
    check(
      'registry_audit_action_check',
      sql`${table.action} IN ('publisher.claimed', 'credential.created', 'credential.revoked', 'entry.published', 'entry.yanked', 'artifact.taken_down', 'artifact.restored', 'artifact.hard_delete_requested', 'artifact.hard_delete_completed', 'publisher.suspended', 'publisher.reinstated', 'entry.curated', 'entry.uncurated', 'operator.granted', 'operator.revoked')`,
    ),
  ],
);

const deleteJobs = pgTable(
  'registry_delete_jobs',
  {
    root: text('root')
      .primaryKey()
      .references(() => artifacts.root),
    requestedAuditId: uuid('requested_audit_id')
      .notNull()
      .references(() => audit.id),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: time('next_attempt_at').notNull().defaultNow(),
    completedAt: time('completed_at'),
  },
  (table) => [
    check('registry_delete_attempts_check', sql`${table.attempts} >= 0`),
  ],
);

const reports = pgTable(
  'registry_reports',
  {
    id: uuid('id').primaryKey(),
    sequence: bigint('sequence', { mode: 'bigint' })
      .notNull()
      .generatedAlwaysAsIdentity(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id),
    category: text('category').notNull(),
    details: text('details'),
    createdAt: time('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('registry_reports_sequence_unique').on(table.sequence),
    check(
      'registry_report_category_check',
      sql`${table.category} IN ('privacy', 'copyright', 'harmful_content', 'spam', 'other')`,
    ),
    check(
      'registry_report_details_check',
      sql`${table.details} IS NULL OR char_length(${table.details}) BETWEEN 1 AND 2000`,
    ),
  ],
);

const rateCounters = pgTable(
  'registry_rate_counters',
  {
    scope: text('scope').notNull(),
    windowStart: time('window_start').notNull(),
    expiresAt: time('expires_at').notNull(),
    count: integer('count').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.windowStart] }),
    index('registry_rate_expiry_idx').on(table.expiresAt),
    check('registry_rate_count_check', sql`${table.count} > 0`),
    check(
      'registry_rate_scope_check',
      sql`char_length(${table.scope}) BETWEEN 1 AND 255`,
    ),
  ],
);

export const REGISTRY_TABLES = {
  ...REGISTRY_AUTH_TABLES,
  schemaFingerprint,
  publishers,
  operators,
  credentials,
  artifacts,
  artifactContent,
  entries,
  audit,
  deleteJobs,
  reports,
  rateCounters,
};

/** Security policy applied by the versioned registry migration lane. */
export function registrySidecarSql(roles: {
  app: string;
  operator: string;
}): string {
  const app = escapeIdentifier(roles.app);
  const operator = escapeIdentifier(roles.operator);
  return `
  REVOKE ALL ON ${Object.values(REGISTRY_TABLES)
    .map((table) => `"${getTableName(table)}"`)
    .join(', ')} FROM PUBLIC;
  GRANT USAGE ON SCHEMA public TO ${app}, ${operator};
  GRANT SELECT ON registry_schema_fingerprint TO ${app}, ${operator};
  GRANT SELECT, INSERT, UPDATE, DELETE ON ${Object.values(REGISTRY_AUTH_TABLES)
    .map((table) => `"${getTableName(table)}"`)
    .join(', ')} TO ${app};
  GRANT SELECT ON registry_auth_user TO ${operator};
  GRANT SELECT ON registry_publishers, registry_operators, registry_credentials, registry_artifacts, registry_artifact_content, registry_entries TO ${app}, ${operator};
  GRANT INSERT (id, user_id, name, orcid) ON registry_publishers TO ${app};
  GRANT INSERT (id, publisher_id, token_hash, name, scopes, expires_at) ON registry_credentials TO ${app};
  GRANT INSERT (root, raw_hash, byte_size) ON registry_artifacts TO ${app};
  GRANT INSERT (id, publisher_id, artifact_root) ON registry_entries TO ${app};
  GRANT INSERT (id, entry_id, category, details) ON registry_reports TO ${app};
  GRANT INSERT ON registry_artifact_content TO ${app};
  GRANT UPDATE (name, orcid) ON registry_publishers TO ${app};
  GRANT UPDATE (revoked_at) ON registry_credentials TO ${app};
  GRANT UPDATE (yanked_at) ON registry_entries TO ${app};
  GRANT UPDATE (suspended_at) ON registry_publishers TO ${operator};
  GRANT UPDATE (curated_at) ON registry_entries TO ${operator};
  GRANT UPDATE (blocked_at, deleted_at) ON registry_artifacts TO ${operator};
  GRANT DELETE ON registry_artifact_content TO ${operator};
  GRANT SELECT, INSERT ON registry_audit TO ${app}, ${operator};
  GRANT SELECT, INSERT, UPDATE ON registry_delete_jobs TO ${operator};
  GRANT SELECT (root, completed_at) ON registry_delete_jobs TO ${app};
  GRANT SELECT, UPDATE (details) ON registry_reports TO ${operator};
  GRANT SELECT, INSERT, UPDATE, DELETE ON registry_rate_counters TO ${app}, ${operator};
  GRANT USAGE ON SEQUENCE registry_entries_sequence_seq, registry_reports_sequence_seq TO ${app};
  CREATE OR REPLACE FUNCTION registry_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'Registry audit is immutable' USING ERRCODE = '42501'; END;
  $$;
  REVOKE ALL ON FUNCTION registry_reject_audit_mutation() FROM PUBLIC;
  DROP TRIGGER IF EXISTS registry_audit_immutable ON registry_audit;
  CREATE TRIGGER registry_audit_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON registry_audit FOR EACH STATEMENT EXECUTE FUNCTION registry_reject_audit_mutation();
`.trim();
}

const REGISTRY_SIDECAR_SQL = registrySidecarSql(REGISTRY_ROLES);
// The operator provisions this NOLOGIN role and its isolated backup LOGIN
// before migration. The reviewed role bootstrap stays outside schema history.
export const REGISTRY_SIDECARS = [
  REGISTRY_SIDECAR_SQL,
  `GRANT USAGE ON SCHEMA public, registry_migrations TO ${REGISTRY_BACKUP_ROLE};
GRANT SELECT ON ALL TABLES IN SCHEMA public, registry_migrations TO ${REGISTRY_BACKUP_ROLE};
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, registry_migrations TO ${REGISTRY_BACKUP_ROLE};`,
];
