import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  AUDIT_ALERT_MAX_RECIPIENTS,
  AuditAlertPolicySchema,
} from '@codaco/studio-rpc';

import type { AuditEventInput } from './events.ts';
import { grantsAuditRead } from './read-authorization.ts';
import type { AuditEvent } from './store.ts';

export const ALERT_POLICY_KEYS = AuditAlertPolicySchema.options;
export type AlertPolicyKey = (typeof ALERT_POLICY_KEYS)[number];
export const ALERT_BACKLOG_DAYS = 7;

const DENIAL_TYPES = [
  'audit.read_denied',
  'team.member.role_change_denied',
  'participant.pii.denied',
  'security.denied_attempts.rate_limited',
];
const DENIAL_OPERATIONS = new Set([
  'audit.read',
  'team.updateMemberRole',
  'participants.pii.read',
  'participants.pii.write',
]);

/** Closed, versioned cases: display text and free-form details never route mail. */
export function alertCandidate(event: AuditEventInput): AlertPolicyKey | null {
  if (event.eventVersion !== 1) return null;
  switch (event.eventType) {
    case 'participant.pii.read':
      return 'contact_access';
    case 'participant.pii.lookup':
      return event.details.resultCount > 0 ? 'contact_access' : null;
    case 'webhook.secret.read':
      return event.details.purpose === 'configuration'
        ? 'credential_access'
        : null;
    case 'webhook.secret.updated':
      return 'credential_access';
    case 'audit.read_denied':
    case 'team.member.role_change_denied':
    case 'participant.pii.denied':
      return 'repeated_denials';
    case 'security.denied_attempts.rate_limited':
      return DENIAL_OPERATIONS.has(event.details.operation)
        ? 'repeated_denials'
        : null;
    case 'audit.alert_delivery.acknowledged':
    case 'audit.alert_settings.updated':
    case 'participant.pii.rotated':
    case 'participant.pii.rotation_read':
    case 'participant.pii.updated':
    case 'protocol.created':
    case 'protocol.draft.committed':
    case 'study.created':
    case 'study.creation_denied':
    case 'team.created':
    case 'team.invitation.acceptance_denied':
    case 'team.invitation.acceptance_failed':
    case 'team.invitation.accepted':
    case 'team.invitation.cancellation_denied':
    case 'team.invitation.cancellation_failed':
    case 'team.invitation.cancelled':
    case 'team.invitation.created':
    case 'team.invitation.creation_denied':
    case 'team.member.role_change_failed':
    case 'team.member.role_changed':
    case 'webhook.secret.rotated':
      return null;
  }
  return null;
}

async function denialThresholdReached(
  client: pg.PoolClient,
  teamId: string,
): Promise<boolean> {
  const previous = await client.query(
    `SELECT 1 FROM audit_alert_outbox WHERE team_id = $1 AND alert_policy_key = 'repeated_denials' AND created_at > clock_timestamp() - interval '15 minutes' LIMIT 1`,
    [teamId],
  );
  if (previous.rowCount) return false;
  // At most five rows are needed to prove five attempts. Summary rows replace
  // denied attempts the existing admission limiter intentionally did not append.
  const recent = await client.query<{
    event_type: string;
    details: Record<string, unknown>;
  }>(
    `SELECT event_type, details FROM audit_events WHERE team_id = $1 AND event_version = 1 AND event_type = ANY($2::text[]) AND occurred_at > clock_timestamp() - interval '15 minutes' AND (event_type <> 'security.denied_attempts.rate_limited' OR details->>'operation' = ANY($3::text[])) ORDER BY sequence DESC LIMIT 5`,
    [teamId, DENIAL_TYPES, [...DENIAL_OPERATIONS]],
  );
  return (
    recent.rows.reduce((count, row) => {
      if (row.event_type !== 'security.denied_attempts.rate_limited')
        return count + 1;
      const suppressed = row.details.suppressedCount;
      return (
        count +
        (typeof suppressed === 'number' &&
        Number.isSafeInteger(suppressed) &&
        suppressed > 0
          ? Math.min(5, suppressed)
          : 0)
      );
    }, 0) >= 5
  );
}

/** Called only while append owns the team's audit lock and transaction. */
export async function enqueueAuditAlert(
  client: pg.PoolClient,
  event: AuditEvent,
): Promise<void> {
  const policy = alertCandidate(event);
  if (
    !policy ||
    (policy === 'repeated_denials' &&
      !(await denialThresholdReached(client, event.teamId)))
  )
    return;
  const recipients = await client.query<{
    id: string;
    member_id: string;
    user_id: string;
    role: string;
    in_app: boolean;
    email: boolean;
  }>(
    `SELECT r.id, r.member_id, r.user_id, m.role, r.in_app, r.email
    FROM audit_alert_recipients r JOIN team_members m ON m.id = r.member_id AND m.team_id = r.team_id AND m.user_id = r.user_id
    JOIN "user" u ON u.id = r.user_id AND u."emailVerified"
    JOIN teams t ON t.id = r.team_id
    WHERE r.team_id = $1 ORDER BY r.id LIMIT $2`,
    [event.teamId, AUDIT_ALERT_MAX_RECIPIENTS],
  );
  const eligible = recipients.rows.filter((row) => grantsAuditRead(row.role));
  const outboxId = randomUUID();
  await client.query(
    `INSERT INTO audit_alert_outbox (id, team_id, audit_event_id, audit_event_sequence, event_type, event_version, alert_policy_key, suppressed_at, last_error)
    VALUES ($1, $2, $3, $4::bigint, $5, $6, $7, CASE WHEN $8 THEN clock_timestamp() ELSE NULL END, CASE WHEN $8 THEN 'no eligible configured recipients' ELSE NULL END)`,
    [
      outboxId,
      event.teamId,
      event.id,
      event.sequence,
      event.eventType,
      event.eventVersion,
      policy,
      eligible.length === 0,
    ],
  );
  for (const recipient of eligible) {
    for (const channel of ['in_app', 'email'] as const) {
      if (!recipient[channel]) continue;
      await client.query(
        `INSERT INTO audit_alert_deliveries (id, team_id, outbox_id, recipient_id, member_id, user_id, channel) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          event.teamId,
          outboxId,
          recipient.id,
          recipient.member_id,
          recipient.user_id,
          channel,
        ],
      );
    }
  }
}
