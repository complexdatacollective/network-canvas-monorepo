import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  teamIsolationPolicy,
  tenantTablesSql,
  TENANT_ROLES,
} from '@codaco/studio-sync/rls';

import { AUTH_TABLES } from '../db/auth-schema.ts';

const invitationDeliveries = pgTable(
  'team_invitation_deliveries',
  {
    id: uuid('id').primaryKey(),
    invitationId: text('invitation_id').notNull(),
    teamId: text('team_id').notNull(),
    email: text('email').notNull(),
    role: text('role').notNull(),
    teamLabel: text('team_label').notNull(),
    inviterLabel: text('inviter_label').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseOwner: uuid('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('team_invitation_deliveries_invitation_id_idx').on(
      table.invitationId,
    ),
    foreignKey({
      name: 'team_invitation_deliveries_invitation_team_fk',
      columns: [table.invitationId, table.teamId],
      foreignColumns: [
        AUTH_TABLES.team_invitations.id,
        AUTH_TABLES.team_invitations.team_id,
      ],
    }).onDelete('cascade'),
    index('team_invitation_deliveries_dispatch_idx').on(
      table.availableAt,
      table.leaseExpiresAt,
    ),
    check(
      'team_invitation_deliveries_attempt_count_check',
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      'team_invitation_deliveries_role_check',
      sql`${table.role} IN ('owner', 'admin', 'member')`,
    ),
    check(
      'team_invitation_deliveries_payload_lengths_check',
      sql`char_length(${table.teamId}) BETWEEN 1 AND 255
          AND char_length(${table.email}) BETWEEN 1 AND 320
          AND char_length(${table.teamLabel}) BETWEEN 1 AND 320
          AND char_length(${table.inviterLabel}) BETWEEN 1 AND 320`,
    ),
    check(
      'team_invitation_deliveries_lease_check',
      sql`(${table.leaseOwner} IS NULL) = (${table.leaseExpiresAt} IS NULL)`,
    ),
    check(
      'team_invitation_deliveries_terminal_state_check',
      sql`num_nonnulls(${table.sentAt}, ${table.failedAt}, ${table.suppressedAt}) <= 1
          AND (
            num_nonnulls(${table.sentAt}, ${table.failedAt}, ${table.suppressedAt}) = 0
            OR (${table.leaseOwner} IS NULL AND ${table.leaseExpiresAt} IS NULL)
          )`,
    ),
    teamIsolationPolicy(),
  ],
);

export const INVITATION_DELIVERY_TABLES = { invitationDeliveries };

export const INVITATION_DELIVERY_SIDECAR_SQL = `
CREATE OR REPLACE FUNCTION invitation_delivery_payload_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'invitation delivery payload is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER invitation_delivery_payload_immutable
  BEFORE UPDATE ON team_invitation_deliveries
  FOR EACH ROW
  WHEN (
    NEW.id IS DISTINCT FROM OLD.id
    OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id
    OR NEW.team_id IS DISTINCT FROM OLD.team_id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.team_label IS DISTINCT FROM OLD.team_label
    OR NEW.inviter_label IS DISTINCT FROM OLD.inviter_label
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  )
  EXECUTE FUNCTION invitation_delivery_payload_is_immutable();

${tenantTablesSql(['team_invitation_deliveries'])}

-- Commands may enqueue inside their audited transaction, but only the
-- maintenance dispatcher can advance delivery state. The trigger keeps the
-- snapshotted recipient, role, labels, invitation, and expiry immutable even
-- for that cross-team role and privileged connections.
REVOKE UPDATE, DELETE ON team_invitation_deliveries FROM ${TENANT_ROLES.app};
`;
