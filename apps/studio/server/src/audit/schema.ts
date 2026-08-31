import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
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
      sql`char_length(${table.actorLabel}) BETWEEN 1 AND 320
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

export const AUDIT_TABLES = { auditEvents };

// This sidecar must run after the general access grant. The table receives the
// ordinary tenant grants first, then permanently loses every mutating
// privilege except INSERT. The trigger is a second line of defense for a
// privileged connection or a future accidentally broad grant.
export const AUDIT_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION audit_events_are_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_are_immutable();

${tenantTablesSql(['audit_events'])}

REVOKE UPDATE, DELETE, TRUNCATE ON audit_events
  FROM ${TENANT_ROLES.app}, ${TENANT_ROLES.maintenance};
`;
