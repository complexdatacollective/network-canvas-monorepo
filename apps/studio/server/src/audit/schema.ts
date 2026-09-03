import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  teamIsolationPolicy,
  TEAM_GUC,
  tenantTablesSql,
  TENANT_ROLES,
} from '@codaco/studio-sync/rls';

const AUDIT_TEAM_ISOLATION_PREDICATE = `team_id = NULLIF(current_setting('${TEAM_GUC}', true), '')`;

function auditTeamIsolationPolicy() {
  return pgPolicy('audit_team_isolation', {
    for: 'all',
    using: sql.raw(AUDIT_TEAM_ISOLATION_PREDICATE),
    withCheck: sql.raw(AUDIT_TEAM_ISOLATION_PREDICATE),
  });
}

const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    // Deliberately no foreign keys: deleting mutable domain or auth rows must
    // never cascade into immutable history.
    teamId: text('team_id').notNull(),
    teamLabel: text('team_label').notNull(),
    sequence: bigint('sequence', { mode: 'bigint' }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`statement_timestamp()`),
    eventType: text('event_type').notNull(),
    eventVersion: smallint('event_version').notNull(),
    category: text('category').notNull(),
    outcome: text('outcome').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id'),
    actorLabel: text('actor_label').notNull(),
    subjectType: text('subject_type'),
    subjectId: text('subject_id'),
    subjectLabel: text('subject_label'),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    resourceLabel: text('resource_label'),
    requestId: uuid('request_id').notNull(),
    details: jsonb('details').notNull(),
  },
  (table) => [
    // The composite key children pin through. A single-column FK to `id` would
    // let one team cite another team's event: referential-integrity checks
    // bypass row-level security, so it would be a cross-team existence oracle.
    // Additive on an append-only table: no data change, and the FK's NO ACTION
    // only adds a reason a delete of an audit event fails.
    unique().on(table.id, table.teamId),
    uniqueIndex('audit_events_team_id_sequence_idx').on(
      table.teamId,
      table.sequence,
    ),
    index('audit_events_team_id_occurred_at_sequence_desc_idx').on(
      table.teamId,
      table.occurredAt.desc(),
      table.sequence.desc(),
    ),
    index('audit_events_team_id_event_type_sequence_desc_idx').on(
      table.teamId,
      table.eventType,
      table.sequence.desc(),
    ),
    index('audit_events_team_id_actor_id_sequence_desc_idx').on(
      table.teamId,
      table.actorId,
      table.sequence.desc(),
    ),
    check(
      'audit_events_category_check',
      sql`${table.category} IN ('team_access', 'protocol', 'study', 'participant_data', 'data_egress', 'credential', 'integration', 'security', 'audit')`,
    ),
    check(
      'audit_events_outcome_check',
      sql`${table.outcome} IN ('succeeded', 'denied', 'failed')`,
    ),
    check(
      'audit_events_actor_kind_check',
      sql`${table.actorKind} IN ('user', 'api_token', 'system')`,
    ),
    check(
      'audit_events_actor_id_check',
      sql`${table.actorKind} = 'system' OR ${table.actorId} IS NOT NULL`,
    ),
    check(
      'audit_events_sequence_check',
      sql`${table.sequence} > 0 AND ${table.eventVersion} > 0`,
    ),
    check(
      'audit_events_identifier_lengths_check',
      sql`char_length(${table.teamId}) BETWEEN 1 AND 255
          AND char_length(${table.eventType}) BETWEEN 1 AND 128
          AND (${table.actorId} IS NULL OR char_length(${table.actorId}) BETWEEN 1 AND 255)
          AND (${table.subjectType} IS NULL OR char_length(${table.subjectType}) BETWEEN 1 AND 64)
          AND (${table.subjectId} IS NULL OR char_length(${table.subjectId}) BETWEEN 1 AND 255)
          AND (${table.resourceType} IS NULL OR char_length(${table.resourceType}) BETWEEN 1 AND 64)
          AND (${table.resourceId} IS NULL OR char_length(${table.resourceId}) BETWEEN 1 AND 255)`,
    ),
    check(
      'audit_events_label_lengths_check',
      sql`char_length(${table.teamLabel}) BETWEEN 1 AND 320
          AND char_length(${table.actorLabel}) BETWEEN 1 AND 320
          AND (${table.subjectLabel} IS NULL OR char_length(${table.subjectLabel}) BETWEEN 1 AND 320)
          AND (${table.resourceLabel} IS NULL OR char_length(${table.resourceLabel}) BETWEEN 1 AND 320)`,
    ),
    check(
      'audit_events_details_object_check',
      sql`jsonb_typeof(${table.details}) = 'object'`,
    ),
    // Audit reads and writes always require explicit team context, including
    // maintenance jobs. Unlike mutable tenant data, an accidental unscoped
    // maintenance query must not be able to enumerate every team's history.
    auditTeamIsolationPolicy(),
  ],
);

// The staged CSV export (#1520). The row and its outbox task are created in the
// short locked transaction that also commits
// `audit.export.started (deliveryMode = 'staged')`; a maintenance worker
// generates the artifact without the team lock; a second audited transaction
// records completion and publishes a single-use handle.
const auditExportJobs = pgTable(
  'audit_export_jobs',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    // The requesting principal. The ready handle is bound to exactly this
    // actor and team; the status route reveals only this actor's jobs.
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),
    // Recorded, not foreign-keyed: audit_events deliberately carries no
    // foreign keys in either direction, and a job is operational state that
    // must not become a delete-order constraint on immutable history.
    startEventId: uuid('start_event_id').notNull(),
    startEventSequence: bigint('start_event_sequence', {
      mode: 'bigint',
    }).notNull(),
    // The captured visible high-water mark. Generation is constrained by
    // `sequence <= high_water_sequence`, so the file never contains its own
    // later completion event.
    highWaterSequence: bigint('high_water_sequence', {
      mode: 'bigint',
    }).notNull(),
    filters: jsonb('filters').notNull(),
    rowLimit: integer('row_limit').notNull(),
    byteLimit: bigint('byte_limit', { mode: 'number' }).notNull(),
    preflightRowCount: integer('preflight_row_count').notNull(),
    preflightByteCount: bigint('preflight_byte_count', {
      mode: 'number',
    }).notNull(),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: uuid('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    artifactKey: text('artifact_key'),
    artifactRowCount: integer('artifact_row_count'),
    artifactByteCount: bigint('artifact_byte_count', { mode: 'number' }),
    // sha256 hex of a 256-bit CSPRNG handle. The handle itself is returned
    // once, in the response that announces readiness, and never stored.
    handleHash: text('handle_hash'),
    handleExpiresAt: timestamp('handle_expires_at', { withTimezone: true }),
    handleConsumedAt: timestamp('handle_consumed_at', { withTimezone: true }),
    completionEventId: uuid('completion_event_id'),
    failureEventId: uuid('failure_event_id'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
  },
  (table) => [
    unique().on(table.id, table.teamId),
    index('audit_export_jobs_team_id_actor_id_created_at_idx').on(
      table.teamId,
      table.actorId,
      table.createdAt.desc(),
    ),
    index('audit_export_jobs_dispatch_idx')
      .on(table.availableAt, table.leaseExpiresAt)
      .where(sql`status IN ('pending', 'generating')`),
    uniqueIndex('audit_export_jobs_handle_hash_idx')
      .on(table.handleHash)
      .where(sql`handle_hash IS NOT NULL`),
    check(
      'audit_export_jobs_status_check',
      sql`${table.status} IN ('pending', 'generating', 'ready', 'failed')`,
    ),
    check(
      'audit_export_jobs_actor_kind_check',
      sql`${table.actorKind} IN ('user', 'api_token')`,
    ),
    check(
      'audit_export_jobs_budgets_check',
      sql`${table.rowLimit} > 0 AND ${table.byteLimit} > 0
          AND ${table.preflightRowCount} >= 0 AND ${table.preflightByteCount} >= 0
          AND ${table.attemptCount} >= 0
          AND ${table.startEventSequence} > 0
          AND ${table.highWaterSequence} >= 0`,
    ),
    check(
      'audit_export_jobs_filters_object_check',
      sql`jsonb_typeof(${table.filters}) = 'object'`,
    ),
    check(
      'audit_export_jobs_handle_hash_format_check',
      sql`${table.handleHash} IS NULL OR ${table.handleHash} ~ '^[0-9a-f]{64}$'`,
    ),
    // Readiness is all-or-nothing: no handle, no artifact coordinates, and
    // no completion event may exist unless the job is ready, and a ready job
    // must carry every one of them. This is the database half of "no handle
    // or partial artifact is released before that commit".
    check(
      'audit_export_jobs_ready_state_check',
      sql`(${table.status} = 'ready') = (
            ${table.handleHash} IS NOT NULL
            AND ${table.handleExpiresAt} IS NOT NULL
            AND ${table.artifactKey} IS NOT NULL
            AND ${table.artifactRowCount} IS NOT NULL
            AND ${table.artifactByteCount} IS NOT NULL
            AND ${table.completionEventId} IS NOT NULL
            AND ${table.readyAt} IS NOT NULL
          )`,
    ),
    check(
      'audit_export_jobs_failed_state_check',
      sql`(${table.status} = 'failed') = (
            ${table.failedAt} IS NOT NULL AND ${table.failureEventId} IS NOT NULL
          )
          AND (${table.status} <> 'failed' OR ${table.artifactKey} IS NULL)`,
    ),
    check(
      'audit_export_jobs_consumed_check',
      sql`${table.handleConsumedAt} IS NULL OR ${table.handleHash} IS NOT NULL`,
    ),
    check(
      'audit_export_jobs_lease_check',
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    // A terminal job holds no lease.
    check(
      'audit_export_jobs_terminal_state_check',
      sql`${table.status} IN ('pending', 'generating')
          OR (${table.leaseOwner} IS NULL AND ${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      'audit_export_jobs_identifier_lengths_check',
      sql`char_length(${table.teamId}) BETWEEN 1 AND 255
          AND char_length(${table.actorId}) BETWEEN 1 AND 255
          AND (${table.artifactKey} IS NULL OR char_length(${table.artifactKey}) BETWEEN 1 AND 1024)
          AND (${table.lastError} IS NULL OR char_length(${table.lastError}) <= 1000)`,
    ),
    // The ordinary policy, with the maintenance escape — deliberately not the
    // strict audit policy above. See the note on AUDIT_SIDECAR_SQL.
    teamIsolationPolicy(),
  ],
);

// Exactly one durable row per alert-eligible committed audit event (#1521),
// inserted in the same transaction as the event. The audit event stays the
// immutable source of truth; everything here is mutable delivery state.
const auditAlertOutbox = pgTable(
  'audit_alert_outbox',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    auditEventId: uuid('audit_event_id').notNull(),
    auditEventSequence: bigint('audit_event_sequence', {
      mode: 'bigint',
    }).notNull(),
    // Denormalized so the dispatcher can route, threshold, and rate-limit
    // without reading the immutable row — and so policy decides from the
    // server-owned event type, never from rendered text.
    eventType: text('event_type').notNull(),
    eventVersion: smallint('event_version').notNull(),
    alertPolicyKey: text('alert_policy_key').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: uuid('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // "Exactly one durable outbox row per alert-eligible committed event."
    uniqueIndex('audit_alert_outbox_audit_event_id_idx').on(table.auditEventId),
    foreignKey({
      name: 'audit_alert_outbox_audit_event_fk',
      columns: [table.auditEventId, table.teamId],
      foreignColumns: [auditEvents.id, auditEvents.teamId],
    }),
    index('audit_alert_outbox_dispatch_idx')
      .on(table.availableAt, table.leaseExpiresAt)
      .where(
        sql`delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL`,
      ),
    index('audit_alert_outbox_team_id_event_type_created_at_idx').on(
      table.teamId,
      table.eventType,
      table.createdAt.desc(),
    ),
    check(
      'audit_alert_outbox_sequence_check',
      sql`${table.auditEventSequence} > 0 AND ${table.eventVersion} > 0
          AND ${table.attemptCount} >= 0`,
    ),
    check(
      'audit_alert_outbox_lengths_check',
      sql`char_length(${table.teamId}) BETWEEN 1 AND 255
          AND char_length(${table.eventType}) BETWEEN 1 AND 128
          AND char_length(${table.alertPolicyKey}) BETWEEN 1 AND 128
          AND (${table.lastError} IS NULL OR char_length(${table.lastError}) <= 1000)`,
    ),
    check(
      'audit_alert_outbox_lease_check',
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      'audit_alert_outbox_terminal_state_check',
      sql`num_nonnulls(${table.deliveredAt}, ${table.failedAt}, ${table.suppressedAt}) <= 1
          AND (
            num_nonnulls(${table.deliveredAt}, ${table.failedAt}, ${table.suppressedAt}) = 0
            OR (${table.leaseOwner} IS NULL AND ${table.leaseExpiresAt} IS NULL)
          )`,
    ),
    // The ordinary policy, with the maintenance escape — deliberately not the
    // strict audit policy above. See the note on AUDIT_SIDECAR_SQL.
    teamIsolationPolicy(),
  ],
);

export const AUDIT_TABLES = { auditEvents, auditExportJobs, auditAlertOutbox };

// This sidecar must run after the general access grant. `audit_events` receives
// the ordinary tenant grants first, then permanently loses every mutating
// privilege except INSERT. The trigger is a second line of defense for a
// privileged connection or a future accidentally broad grant.
//
// The two outbox tables keep the ordinary `team_isolation` policy rather than
// inheriting `audit_team_isolation`, and the difference is deliberate. Both are
// worker-driven: the staged-export generator and the alert dispatcher run as
// studio_maintenance and must claim work across teams, exactly as the
// invitation dispatcher does — under the strict policy they would see nothing
// and report a clean sweep. Neither table carries event content: the outbox
// holds ids, a machine event type and counters, and the job holds filters,
// budgets and byte counts, so the readable history the strict policy protects
// stays behind it. And the dispatcher still re-reads the event under an
// explicit per-team tenant scope before rendering an alert, which is the only
// state in which the maintenance role may read audit_events at all: the escape
// buys the claim scan, not the history.
export const AUDIT_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION audit_events_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_are_immutable();

-- An export request is a promise about what will be generated: its filters,
-- high-water mark, budgets and preflight result are the contract the
-- completion event is checked against, so no worker may edit them.
CREATE OR REPLACE FUNCTION audit_export_request_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit export request is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_export_request_immutable
  BEFORE UPDATE ON audit_export_jobs
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.actor_kind IS DISTINCT FROM OLD.actor_kind
    OR NEW.actor_id IS DISTINCT FROM OLD.actor_id
    OR NEW.start_event_id IS DISTINCT FROM OLD.start_event_id
    OR NEW.start_event_sequence IS DISTINCT FROM OLD.start_event_sequence
    OR NEW.high_water_sequence IS DISTINCT FROM OLD.high_water_sequence
    OR NEW.filters IS DISTINCT FROM OLD.filters
    OR NEW.row_limit IS DISTINCT FROM OLD.row_limit
    OR NEW.byte_limit IS DISTINCT FROM OLD.byte_limit
    OR NEW.preflight_row_count IS DISTINCT FROM OLD.preflight_row_count
    OR NEW.preflight_byte_count IS DISTINCT FROM OLD.preflight_byte_count
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION audit_export_request_is_immutable();

-- A handle is single-use: once consumed it can never be un-consumed, and a
-- consumed or expired handle can never be re-issued on the same row.
CREATE OR REPLACE FUNCTION audit_export_handle_is_single_use() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit export handle is single use';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_export_handle_single_use
  BEFORE UPDATE ON audit_export_jobs
  FOR EACH ROW
  WHEN (
    (OLD.handle_consumed_at IS NOT NULL AND NEW.handle_consumed_at IS DISTINCT FROM OLD.handle_consumed_at)
    OR (OLD.handle_hash IS NOT NULL AND NEW.handle_hash IS DISTINCT FROM OLD.handle_hash)
  )
  EXECUTE FUNCTION audit_export_handle_is_single_use();

-- The alert outbox's link to its immutable event, and the reason it exists,
-- are fixed at insert; only delivery state moves.
CREATE OR REPLACE FUNCTION audit_alert_link_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit alert link is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_alert_link_immutable
  BEFORE UPDATE ON audit_alert_outbox
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.audit_event_id IS DISTINCT FROM OLD.audit_event_id
    OR NEW.audit_event_sequence IS DISTINCT FROM OLD.audit_event_sequence
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.event_version IS DISTINCT FROM OLD.event_version
    OR NEW.alert_policy_key IS DISTINCT FROM OLD.alert_policy_key
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION audit_alert_link_is_immutable();

${tenantTablesSql(['audit_events', 'audit_export_jobs', 'audit_alert_outbox'])}

-- Commands enqueue inside their audited transaction; only the maintenance
-- worker advances generation and delivery state. DELETE stays with
-- ${TENANT_ROLES.maintenance} on both: terminal outbox rows and expired jobs
-- are swept on a retention window, and the artifact object is deleted with the
-- row. The one exception is consuming a download handle, which happens on the
-- app-served download GET and is admitted as a column-level grant rather than
-- table-level UPDATE. One statement per table so both are documented.
REVOKE UPDATE, DELETE ON audit_export_jobs FROM ${TENANT_ROLES.app};
REVOKE UPDATE, DELETE ON audit_alert_outbox FROM ${TENANT_ROLES.app};
GRANT UPDATE (handle_consumed_at) ON audit_export_jobs TO ${TENANT_ROLES.app};

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events
  FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
`;
