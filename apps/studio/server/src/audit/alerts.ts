import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  AuditAlertRecipientsSchema,
  type AuditAlertItem,
  type AuditAlertRecipient,
  type AuditAlertSettings,
} from '@codaco/studio-rpc';

import { ALERT_POLICY_KEYS } from './alert-policy.ts';
import {
  auditActorEventContext,
  runAuditedCommand,
  type AuditedCommandContext,
} from './command.ts';
import { authorizeAuditRead, grantsAuditRead } from './read-authorization.ts';
import { lockAuditTeam } from './store.ts';
import { runNoAuditTenantTransaction } from './transaction.ts';

export class AuditAlertError extends Error {
  readonly code: 'FORBIDDEN' | 'CONFLICT' | 'BAD_REQUEST' | 'NOT_FOUND';
  constructor(code: AuditAlertError['code']) {
    super(code);
    this.name = 'AuditAlertError';
    this.code = code;
  }
}

async function authorize(
  client: pg.PoolClient,
  context: AuditedCommandContext,
) {
  const access = await authorizeAuditRead(client, {
    teamId: context.tenantDb.teamId,
    actorUserId: context.principal.userId,
  });
  const verified = await client.query(
    'SELECT 1 FROM "user" WHERE id = $1 AND "emailVerified" FOR SHARE',
    [context.principal.userId],
  );
  if (access !== 'permitted' || verified.rowCount !== 1)
    throw new AuditAlertError('FORBIDDEN');
}

type StoredRecipient = AuditAlertRecipient & { id: string; userId: string };
async function recipients(client: pg.PoolClient, teamId: string) {
  return (
    await client.query<StoredRecipient>(
      'SELECT id, member_id AS "memberId", user_id AS "userId", in_app AS "inApp", email FROM audit_alert_recipients WHERE team_id = $1 ORDER BY member_id',
      [teamId],
    )
  ).rows;
}
function compareMembers(
  a: AuditAlertRecipient,
  b: AuditAlertRecipient,
): number {
  return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
}
function preferences(rows: StoredRecipient[]): AuditAlertRecipient[] {
  return rows
    .map(({ memberId, inApp, email }) => ({ memberId, inApp, email }))
    .toSorted(compareMembers);
}

export function readAuditAlertSettings(
  context: AuditedCommandContext,
  emailAvailable: boolean,
): Promise<AuditAlertSettings> {
  return runNoAuditTenantTransaction(
    context.tenantDb,
    'audit.alerts.settings',
    async (client) => {
      await lockAuditTeam(client, context.tenantDb.teamId);
      await authorize(client, context);
      const current = await client.query<{ revision: string }>(
        'SELECT revision FROM audit_alert_settings WHERE team_id = $1',
        [context.tenantDb.teamId],
      );
      const stored = await recipients(client, context.tenantDb.teamId);
      const members = await client.query<{
        memberId: string;
        role: string;
        name: string;
        email: string;
      }>(
        `SELECT m.id AS "memberId", m.role, u.name, u.email FROM team_members m
          JOIN "user" u ON u.id = m.user_id AND u."emailVerified"
          WHERE m.team_id = $1 AND (m.id = ANY($2::text[])
            OR string_to_array(replace(m.role, ' ', ''), ',') && ARRAY['owner', 'admin'])
          ORDER BY (m.id = ANY($2::text[])) DESC, m.id LIMIT 101`,
        [context.tenantDb.teamId, stored.map((row) => row.memberId)],
      );
      const eligible = members.rows.filter((member) =>
        grantsAuditRead(member.role),
      );
      return {
        revision: current.rows[0]?.revision ?? null,
        recipients: preferences(stored),
        eligibleMembers: eligible
          .slice(0, 100)
          .map(({ memberId, name, email }) => ({ memberId, name, email })),
        eligibleMembersTruncated: members.rows.length > 100,
        emailAvailable,
      };
    },
  );
}

export function updateAuditAlertSettings(
  context: AuditedCommandContext,
  input: { revision: string | null; recipients: AuditAlertRecipient[] },
  emailAvailable: boolean,
): Promise<{ revision: string }> {
  const validated = AuditAlertRecipientsSchema.parse(input.recipients).toSorted(
    compareMembers,
  );
  return runAuditedCommand(context, async (client, auditContext) => {
    await authorize(client, context);
    const teamId = context.tenantDb.teamId;
    const current = await client.query<{ revision: string }>(
      'SELECT revision FROM audit_alert_settings WHERE team_id = $1 FOR UPDATE',
      [teamId],
    );
    if ((current.rows[0]?.revision ?? null) !== input.revision)
      throw new AuditAlertError('CONFLICT');
    const before = await recipients(client, teamId);
    if (validated.some((recipient) => recipient.email) && !emailAvailable)
      throw new AuditAlertError('BAD_REQUEST');
    const eligible = await client.query<{
      id: string;
      user_id: string;
      role: string;
    }>(
      `SELECT m.id, m.user_id, m.role FROM team_members m JOIN "user" u ON u.id = m.user_id AND u."emailVerified" WHERE m.team_id = $1 AND m.id = ANY($2::text[]) ORDER BY m.id FOR SHARE OF m, u`,
      [teamId, validated.map((recipient) => recipient.memberId)],
    );
    if (
      eligible.rows.length !== validated.length ||
      eligible.rows.some((row) => !grantsAuditRead(row.role))
    )
      throw new AuditAlertError('BAD_REQUEST');
    if (
      current.rows[0] &&
      JSON.stringify(preferences(before)) === JSON.stringify(validated)
    )
      return {
        status: 'unchanged',
        result: { revision: current.rows[0].revision },
      };
    // Retain the preference identity only when every channel and membership
    // field is unchanged. Re-enrollment cannot revive already revoked work.
    await client.query(
      'DELETE FROM audit_alert_recipients WHERE team_id = $1 AND NOT (member_id = ANY($2::text[]))',
      [teamId, validated.map((row) => row.memberId)],
    );
    for (const recipient of validated) {
      const member = eligible.rows.find((row) => row.id === recipient.memberId);
      if (!member) throw new AuditAlertError('BAD_REQUEST');
      await client.query(
        `INSERT INTO audit_alert_recipients (id, team_id, member_id, user_id, in_app, email) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (team_id, member_id) DO UPDATE SET id = EXCLUDED.id, user_id = EXCLUDED.user_id, in_app = EXCLUDED.in_app, email = EXCLUDED.email
        WHERE audit_alert_recipients.user_id IS DISTINCT FROM EXCLUDED.user_id OR audit_alert_recipients.in_app IS DISTINCT FROM EXCLUDED.in_app OR audit_alert_recipients.email IS DISTINCT FROM EXCLUDED.email`,
        [
          randomUUID(),
          teamId,
          recipient.memberId,
          member.user_id,
          recipient.inApp,
          recipient.email,
        ],
      );
    }
    const revision = randomUUID();
    await client.query(
      'INSERT INTO audit_alert_settings (team_id, revision) VALUES ($1, $2) ON CONFLICT (team_id) DO UPDATE SET revision = EXCLUDED.revision',
      [teamId, revision],
    );
    return {
      status: 'succeeded',
      result: { revision },
      events: [
        {
          ...auditActorEventContext(auditContext),
          eventType: 'audit.alert_settings.updated',
          eventVersion: 1,
          category: 'audit',
          outcome: 'succeeded',
          subjectType: null,
          subjectId: null,
          subjectLabel: null,
          resourceType: null,
          resourceId: null,
          resourceLabel: null,
          details: {
            previousRecipients: preferences(before),
            recipients: validated,
          },
        },
      ],
    };
  });
}

const CURRENT_RECIPIENT = `EXISTS (SELECT 1 FROM audit_alert_recipients r JOIN team_members m ON m.id = r.member_id AND m.user_id = r.user_id AND m.team_id = r.team_id WHERE r.id = d.recipient_id AND r.team_id = d.team_id AND r.member_id = d.member_id AND r.user_id = d.user_id AND CASE WHEN d.channel = 'email' THEN r.email ELSE r.in_app END)`;

export function listAuditAlerts(
  context: AuditedCommandContext,
  cursor?: string,
) {
  return runNoAuditTenantTransaction(
    context.tenantDb,
    'audit.alerts.list',
    async (client) => {
      await lockAuditTeam(client, context.tenantDb.teamId);
      await authorize(client, context);
      const rows = await client.query<AuditAlertItem>(
        `SELECT o.id, o.audit_event_sequence::text AS sequence, o.alert_policy_key AS policy, o.created_at AS "createdAt",
      bool_or(d.channel = 'in_app' AND d.delivered_at IS NOT NULL) AS "inApp",
      max(d.read_at) FILTER (WHERE d.channel = 'in_app') AS "readAt",
      max(CASE WHEN d.channel <> 'email' THEN NULL WHEN d.uncertain_at IS NOT NULL THEN 'uncertain' WHEN d.failed_at IS NOT NULL THEN 'failed' WHEN d.suppressed_at IS NOT NULL THEN 'suppressed' WHEN d.delivered_at IS NOT NULL THEN 'delivered' ELSE 'pending' END) AS "emailState",
      max(d.id::text) FILTER (WHERE d.channel = 'email') AS "emailDeliveryId",
      max(d.acknowledged_at) FILTER (WHERE d.channel = 'email') AS "emailAcknowledgedAt"
      FROM audit_alert_outbox o JOIN audit_alert_deliveries d ON d.outbox_id = o.id AND d.team_id = o.team_id
      WHERE d.team_id = $1 AND d.user_id = $2 AND ${CURRENT_RECIPIENT}
        AND ($3::bigint IS NULL OR o.audit_event_sequence < $3::bigint)
        AND o.alert_policy_key = ANY($4::text[])
        AND (d.channel = 'email' OR d.delivered_at IS NOT NULL)
      GROUP BY o.id ORDER BY o.audit_event_sequence DESC LIMIT 51`,
        [
          context.tenantDb.teamId,
          context.principal.userId,
          cursor ?? null,
          ALERT_POLICY_KEYS,
        ],
      );
      const items = rows.rows.slice(0, 50);
      return {
        items,
        nextCursor:
          rows.rows.length > 50 ? (items.at(-1)?.sequence ?? null) : null,
      };
    },
  );
}

export function markAuditAlertRead(
  context: AuditedCommandContext,
  alertId: string,
): Promise<void> {
  return runNoAuditTenantTransaction(
    context.tenantDb,
    'audit.alerts.markRead',
    async (client) => {
      await lockAuditTeam(client, context.tenantDb.teamId);
      await authorize(client, context);
      const read = await client.query(
        `UPDATE audit_alert_deliveries d SET read_at = COALESCE(read_at, clock_timestamp()) WHERE d.outbox_id = $1 AND d.team_id = $2 AND d.user_id = $3 AND d.channel = 'in_app' AND d.delivered_at IS NOT NULL AND ${CURRENT_RECIPIENT}`,
        [alertId, context.tenantDb.teamId, context.principal.userId],
      );
      if (read.rowCount !== 1) throw new AuditAlertError('NOT_FOUND');
    },
  );
}

export function acknowledgeAuditAlert(
  context: AuditedCommandContext,
  deliveryId: string,
): Promise<void> {
  return runAuditedCommand(context, async (client, auditContext) => {
    await authorize(client, context);
    const row = await client.query<{ acknowledged_at: Date | null }>(
      `SELECT d.acknowledged_at FROM audit_alert_deliveries d WHERE d.id = $1 AND d.team_id = $2 AND d.user_id = $3 AND d.uncertain_at IS NOT NULL AND ${CURRENT_RECIPIENT} FOR UPDATE OF d`,
      [deliveryId, context.tenantDb.teamId, context.principal.userId],
    );
    if (!row.rows[0]) throw new AuditAlertError('NOT_FOUND');
    if (row.rows[0].acknowledged_at)
      return { status: 'unchanged', result: undefined };
    await client.query(
      'UPDATE audit_alert_deliveries SET acknowledged_at = clock_timestamp() WHERE id = $1',
      [deliveryId],
    );
    return {
      status: 'succeeded',
      result: undefined,
      events: [
        {
          ...auditActorEventContext(auditContext),
          eventVersion: 1,
          eventType: 'audit.alert_delivery.acknowledged',
          category: 'audit',
          outcome: 'succeeded',
          subjectType: 'audit_alert_delivery',
          subjectId: deliveryId,
          subjectLabel: null,
          resourceType: null,
          resourceId: null,
          resourceLabel: null,
          details: { disposition: 'uncertainty_acknowledged_no_resend' },
        },
      ],
    };
  });
}
