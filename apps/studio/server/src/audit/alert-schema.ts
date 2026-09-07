import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  backupReadPolicy,
  teamIsolationPolicies,
  tenantTablesSql,
  TENANT_ROLES,
} from '@codaco/studio-sync/rls';

import { AUDIT_TABLES } from './schema.ts';

const auditAlertSettings = pgTable(
  'audit_alert_settings',
  {
    teamId: text('team_id').primaryKey(),
    revision: uuid('revision').notNull(),
  },
  () => teamIsolationPolicies(),
);

const auditAlertRecipients = pgTable(
  'audit_alert_recipients',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    memberId: text('member_id').notNull(),
    userId: text('user_id').notNull(),
    inApp: boolean('in_app').notNull(),
    email: boolean('email').notNull(),
  },
  (table) => [
    unique('audit_alert_recipients_team_member_unique').on(
      table.teamId,
      table.memberId,
    ),
    check(
      'audit_alert_recipients_channels_check',
      sql`${table.inApp} OR ${table.email}`,
    ),
    ...teamIsolationPolicies(),
  ],
);

// A recipient/channel is one independent attempt. Mutable preferences and
// membership have deliberately no cascading FK: revocation suppresses work,
// and cannot erase already completed or uncertain delivery evidence.
const auditAlertDeliveries = pgTable(
  'audit_alert_deliveries',
  {
    id: uuid('id').primaryKey(),
    teamId: text('team_id').notNull(),
    outboxId: uuid('outbox_id').notNull(),
    recipientId: uuid('recipient_id').notNull(),
    memberId: text('member_id').notNull(),
    userId: text('user_id').notNull(),
    channel: text('channel').notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: uuid('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    sendStartedAt: timestamp('send_started_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }),
    uncertainAt: timestamp('uncertain_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('audit_alert_deliveries_identity_unique').on(
      table.outboxId,
      table.memberId,
      table.channel,
    ),
    foreignKey({
      name: 'audit_alert_deliveries_outbox_fk',
      columns: [table.outboxId, table.teamId],
      foreignColumns: [
        AUDIT_TABLES.auditAlertOutbox.id,
        AUDIT_TABLES.auditAlertOutbox.teamId,
      ],
    }),
    index('audit_alert_deliveries_dispatch_idx')
      .on(table.availableAt, table.createdAt)
      .where(
        sql`delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL`,
      ),
    index('audit_alert_deliveries_feed_idx').on(
      table.teamId,
      table.userId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    check(
      'audit_alert_deliveries_channel_check',
      sql`${table.channel} IN ('in_app', 'email')`,
    ),
    check(
      'audit_alert_deliveries_attempt_check',
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      'audit_alert_deliveries_lease_check',
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      'audit_alert_deliveries_terminal_check',
      sql`num_nonnulls(${table.deliveredAt}, ${table.failedAt}, ${table.suppressedAt}, ${table.uncertainAt}) <= 1 AND (num_nonnulls(${table.deliveredAt}, ${table.failedAt}, ${table.suppressedAt}, ${table.uncertainAt}) = 0 OR ${table.leaseOwner} IS NULL)`,
    ),
    check(
      'audit_alert_deliveries_read_check',
      sql`${table.readAt} IS NULL OR (${table.channel} = 'in_app' AND ${table.deliveredAt} IS NOT NULL)`,
    ),
    check(
      'audit_alert_deliveries_ack_check',
      sql`${table.acknowledgedAt} IS NULL OR ${table.uncertainAt} IS NOT NULL`,
    ),
    check(
      'audit_alert_deliveries_error_check',
      sql`${table.lastError} IS NULL OR ${table.lastError} IN ('not_eligible', 'backlog_expired', 'attempts_exhausted', 'send_retryable', 'send_rejected', 'send_uncertain', 'handoff_interrupted')`,
    ),
    ...teamIsolationPolicies(),
  ],
);

// Only the dispatcher writes admission budgets. Two finite kinds of key:
// one deployment singleton and one per team. No identity reaches metrics.
const auditAlertDispatchBudget = pgTable(
  'audit_alert_dispatch_budget',
  {
    scope: text('scope').primaryKey(),
    windowStartedAt: timestamp('window_started_at', {
      withTimezone: true,
    }).notNull(),
    attempts: integer('attempts').notNull(),
  },
  (table) => [
    check(
      'audit_alert_dispatch_budget_check',
      sql`${table.attempts} >= 0 AND char_length(${table.scope}) BETWEEN 1 AND 300`,
    ),
    pgPolicy('maintenance_only', {
      for: 'all',
      using: sql.raw(`current_user = '${TENANT_ROLES.maintenance}'`),
      withCheck: sql.raw(`current_user = '${TENANT_ROLES.maintenance}'`),
    }),
    backupReadPolicy(),
  ],
);

export const AUDIT_ALERT_TABLES = {
  auditAlertSettings,
  auditAlertRecipients,
  auditAlertDeliveries,
  auditAlertDispatchBudget,
};

export const AUDIT_ALERT_SIDECAR_SQL = `
${tenantTablesSql(['audit_alert_settings', 'audit_alert_recipients', 'audit_alert_deliveries'])}
ALTER TABLE audit_alert_dispatch_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_alert_dispatch_budget FORCE ROW LEVEL SECURITY;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON audit_alert_dispatch_budget FROM ${TENANT_ROLES.app};
REVOKE UPDATE, DELETE ON audit_alert_deliveries FROM ${TENANT_ROLES.app};
GRANT UPDATE (read_at, acknowledged_at) ON audit_alert_deliveries TO ${TENANT_ROLES.app};
CREATE OR REPLACE FUNCTION audit_alert_delivery_identity_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit alert delivery identity is immutable'; END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE TRIGGER audit_alert_delivery_identity_immutable
  BEFORE UPDATE ON audit_alert_deliveries FOR EACH ROW
  WHEN (NEW.id IS DISTINCT FROM OLD.id OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.outbox_id IS DISTINCT FROM OLD.outbox_id OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
    OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.channel IS DISTINCT FROM OLD.channel OR NEW.created_at IS DISTINCT FROM OLD.created_at)
  EXECUTE FUNCTION audit_alert_delivery_identity_immutable();
`;
