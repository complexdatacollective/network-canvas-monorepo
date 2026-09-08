import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import {
  auditEventDefinition,
  auditEventKey,
  type AuditEventKey,
} from './events.ts';
import type { AuditEvent } from './store.ts';

type AlertPolicy = { key: string; minimumIntervalSeconds: number };

const POLICY: Partial<Record<AuditEventKey, AlertPolicy>> = {
  'security.denied_attempts.rate_limited@1': {
    key: 'repeated_high_risk_denial',
    minimumIntervalSeconds: 15 * 60,
  },
};

function policyFor(event: AuditEvent): AlertPolicy | undefined {
  const key = auditEventKey(event);
  if (!auditEventDefinition(event).createsAlert) return undefined;
  const policy = POLICY[key];
  if (!policy) throw new Error(`missing researcher alert policy for ${key}`);
  return policy;
}

/**
 * Materialize the alert and its current privileged recipients inside the same
 * team-locked transaction that appended the immutable event. Until a distinct
 * team alert-preference surface exists, current enabled owner/admin membership
 * is the delivery policy rather than a stored researcher preference.
 */
export async function enqueueAuditAlertForEvent(
  client: pg.PoolClient,
  event: AuditEvent,
): Promise<string | null> {
  const policy = policyFor(event);
  if (!policy) return null;

  const alertId = randomUUID();
  const inserted = await client.query<{ id: string; suppressed: boolean }>(
    `INSERT INTO audit_alert_outbox (
       id, team_id, audit_event_id, audit_event_sequence, event_type,
       event_version, alert_policy_key, suppressed_at, last_error
     )
     SELECT $1, $2, $3, $4::bigint, $5, $6, $7,
       CASE WHEN EXISTS (
         SELECT 1 FROM audit_alert_outbox recent
         WHERE recent.team_id = $2
           AND recent.alert_policy_key = $7
           AND recent.created_at >= statement_timestamp()
             - make_interval(secs => $8::double precision)
           AND recent.suppressed_at IS NULL
       ) THEN statement_timestamp() ELSE NULL END,
       CASE WHEN EXISTS (
         SELECT 1 FROM audit_alert_outbox recent
         WHERE recent.team_id = $2
           AND recent.alert_policy_key = $7
           AND recent.created_at >= statement_timestamp()
             - make_interval(secs => $8::double precision)
           AND recent.suppressed_at IS NULL
       ) THEN 'researcher alert rate limit' ELSE NULL END
     RETURNING id, suppressed_at IS NOT NULL AS suppressed`,
    [
      alertId,
      event.teamId,
      event.id,
      event.sequence,
      event.eventType,
      event.eventVersion,
      policy.key,
      policy.minimumIntervalSeconds,
    ],
  );
  const alert = inserted.rows[0];
  if (!alert) throw new Error('audit alert enqueue returned no row');
  if (alert.suppressed) return alert.id;

  const recipients = await client.query(
    `INSERT INTO audit_alert_deliveries (
       id, team_id, alert_id, recipient_user_id, channel, delivered_at
     )
     SELECT gen_random_uuid(), $1, $2, member.user_id, channel.name,
            CASE WHEN channel.name = 'in_app' THEN statement_timestamp() END
     FROM team_members member
     JOIN "user" account ON account.id = member.user_id
     CROSS JOIN (VALUES ('email'), ('in_app')) AS channel(name)
     WHERE member.team_id = $1
       AND member.role IN ('owner', 'admin')
       AND account."emailVerified"
       AND NOT account.recovery_disabled`,
    [event.teamId, alert.id],
  );
  if ((recipients.rowCount ?? 0) === 0) {
    await client.query(
      `UPDATE audit_alert_outbox
       SET suppressed_at = statement_timestamp(),
           last_error = 'no verified privileged recipients'
       WHERE id = $1 AND team_id = $2`,
      [alert.id, event.teamId],
    );
  }
  return alert.id;
}

export type InAppAuditAlert = {
  id: string;
  auditEventId: string;
  auditEventSequence: string;
  eventType: string;
  eventVersion: number;
  alertPolicyKey: string;
  createdAt: Date;
  readAt: Date | null;
};

export async function listInAppAuditAlerts(
  client: pg.Pool | pg.PoolClient,
  input: {
    teamId: string;
    userId: string;
    beforeSequence?: string;
    limit?: number;
  },
): Promise<InAppAuditAlert[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const result = await client.query<InAppAuditAlert>(
    `SELECT delivery.id,
            alert.audit_event_id AS "auditEventId",
            alert.audit_event_sequence::text AS "auditEventSequence",
            alert.event_type AS "eventType",
            alert.event_version AS "eventVersion",
            alert.alert_policy_key AS "alertPolicyKey",
            delivery.created_at AS "createdAt",
            delivery.read_at AS "readAt"
     FROM audit_alert_deliveries delivery
     JOIN audit_alert_outbox alert
       ON alert.id = delivery.alert_id AND alert.team_id = delivery.team_id
     JOIN team_members member
       ON member.team_id = delivery.team_id
      AND member.user_id = delivery.recipient_user_id
     JOIN "user" account ON account.id = member.user_id
     WHERE delivery.team_id = $1
       AND delivery.recipient_user_id = $2
       AND delivery.channel = 'in_app'
       AND member.role IN ('owner', 'admin')
       AND account."emailVerified"
       AND NOT account.recovery_disabled
       AND ($3::bigint IS NULL OR alert.audit_event_sequence < $3::bigint)
     ORDER BY alert.audit_event_sequence DESC
     LIMIT $4`,
    [input.teamId, input.userId, input.beforeSequence ?? null, limit],
  );
  return result.rows;
}

export async function markInAppAuditAlertRead(
  client: pg.Pool | pg.PoolClient,
  input: { id: string; teamId: string; userId: string },
): Promise<boolean> {
  const result = await client.query(
    `UPDATE audit_alert_deliveries
     SET read_at = COALESCE(read_at, clock_timestamp())
     WHERE id = $1
       AND team_id = $2
       AND recipient_user_id = $3
       AND channel = 'in_app'
       AND delivered_at IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM team_members member
         JOIN "user" account ON account.id = member.user_id
         WHERE member.team_id = audit_alert_deliveries.team_id
           AND member.user_id = audit_alert_deliveries.recipient_user_id
           AND member.role IN ('owner', 'admin')
           AND account."emailVerified"
           AND NOT account.recovery_disabled
       )`,
    [input.id, input.teamId, input.userId],
  );
  return result.rowCount === 1;
}
