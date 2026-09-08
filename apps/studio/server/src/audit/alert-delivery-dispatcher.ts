import { createHash } from 'node:crypto';

import type pg from 'pg';

import { EmailDeliveryError } from '@codaco/studio-sync/email-sender';
import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { AuditAlertMailer } from '../auth/email.ts';
import { logOperational } from '../observability/logger.ts';
import {
  OutboxDispatcher,
  type OutboxAdapter,
  type OutboxLease,
  type OutboxRetryOptions,
} from '../outbox/dispatcher.ts';
import type { OutboxObserver } from '../outbox/instrumentation.ts';
import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';

const QUEUE = 'audit_alert_outbox';
const MAX_ERROR_LENGTH = 1_000;

type ClaimedAuditAlert = {
  id: string;
  alertId: string;
  recipientUserId: string;
  email: string;
  eventType: string;
  occurredAt: Date;
  attemptCount: number;
};

export type AuditAlertDeliveryOptions = OutboxRetryOptions & {
  pool: pg.Pool;
  mailer: AuditAlertMailer;
  observer?: OutboxObserver;
};

export class AuditAlertDeliveryRoleError extends Error {
  constructor(role: string) {
    super(
      `audit alert delivery must run as ${TENANT_ROLES.maintenance}, not ${role}`,
    );
    this.name = 'AuditAlertDeliveryRoleError';
  }
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_ERROR_LENGTH,
  );
}

function messageId(alertId: string, recipientUserId: string): string {
  const recipient = createHash('sha256')
    .update(recipientUserId)
    .digest('hex')
    .slice(0, 24);
  return `<studio-audit-alert.${alertId}.${recipient}@networkcanvas.local>`;
}

async function transaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function finalizeParent(
  client: pg.PoolClient,
  alertId: string,
  owner?: string,
): Promise<void> {
  await client.query(
    `WITH state AS (
       SELECT NOT EXISTS (
                SELECT 1 FROM audit_alert_deliveries delivery
                WHERE delivery.alert_id = $1
                  AND delivery.channel = 'email'
                  AND delivery.delivered_at IS NULL
                  AND delivery.failed_at IS NULL
                  AND delivery.suppressed_at IS NULL
                  AND delivery.uncertain_at IS NULL
              ) AS complete,
              EXISTS (
                SELECT 1 FROM audit_alert_deliveries delivery
                WHERE delivery.alert_id = $1
                  AND delivery.channel = 'email'
                  AND delivery.uncertain_at IS NOT NULL
              ) AS uncertain,
              EXISTS (
                SELECT 1 FROM audit_alert_deliveries delivery
                WHERE delivery.alert_id = $1
                  AND delivery.channel = 'email'
                  AND delivery.failed_at IS NOT NULL
              ) AS failed,
              EXISTS (
                SELECT 1 FROM audit_alert_deliveries delivery
                WHERE delivery.alert_id = $1
                  AND delivery.channel = 'email'
                  AND delivery.delivered_at IS NOT NULL
              ) AS delivered,
              EXISTS (
                SELECT 1 FROM audit_alert_deliveries delivery
                WHERE delivery.alert_id = $1
                  AND delivery.channel = 'email'
                  AND delivery.suppressed_at IS NOT NULL
              ) AS suppressed
     )
     UPDATE audit_alert_outbox alert
     SET lease_owner = NULL,
         lease_expires_at = NULL,
         uncertain_at = CASE WHEN state.complete AND state.uncertain
           THEN clock_timestamp() END,
         failed_at = CASE WHEN state.complete AND NOT state.uncertain AND state.failed
           THEN clock_timestamp() END,
         delivered_at = CASE WHEN state.complete AND NOT state.uncertain AND NOT state.failed AND state.delivered
           THEN clock_timestamp() END,
         suppressed_at = CASE WHEN state.complete AND NOT state.uncertain AND NOT state.failed AND NOT state.delivered AND state.suppressed
           THEN clock_timestamp() END
     FROM state
     WHERE alert.id = $1
       AND ($2::uuid IS NULL OR alert.lease_owner = $2)
       AND alert.delivered_at IS NULL
       AND alert.failed_at IS NULL
       AND alert.suppressed_at IS NULL
       AND alert.uncertain_at IS NULL`,
    [alertId, owner ?? null],
  );
}

class AuditAlertDeliveryAdapter implements OutboxAdapter<ClaimedAuditAlert> {
  readonly queue = QUEUE;
  private readonly pool: pg.Pool;
  private readonly mailer: AuditAlertMailer;

  constructor(options: AuditAlertDeliveryOptions) {
    this.pool = options.pool;
    this.mailer = options.mailer;
  }

  failureDisposition(error: unknown): 'retryable' | 'permanent' | 'uncertain' {
    return error instanceof EmailDeliveryError
      ? error.disposition
      : 'retryable';
  }

  async suppressUndeliverable(): Promise<number> {
    return transaction(this.pool, async (client) => {
      const suppressed = await client.query<{ alert_id: string }>(
        `UPDATE audit_alert_deliveries delivery
         SET suppressed_at = clock_timestamp(),
             lease_owner = NULL,
             lease_expires_at = NULL,
             last_error = 'recipient is no longer a verified privileged member'
         WHERE delivery.channel = 'email'
           AND delivery.delivered_at IS NULL
           AND delivery.failed_at IS NULL
           AND delivery.suppressed_at IS NULL
           AND delivery.uncertain_at IS NULL
           AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at <= clock_timestamp())
           AND NOT EXISTS (
             SELECT 1 FROM team_members member
             JOIN "user" account ON account.id = member.user_id
             WHERE member.team_id = delivery.team_id
               AND member.user_id = delivery.recipient_user_id
               AND member.role IN ('owner', 'admin')
               AND account."emailVerified"
               AND NOT account.recovery_disabled
               AND (NOT EXISTS (SELECT 1 FROM audit_alert_preferences configured WHERE configured.team_id = delivery.team_id)
                    OR EXISTS (SELECT 1 FROM audit_alert_preferences preference WHERE preference.team_id = delivery.team_id AND preference.recipient_user_id = delivery.recipient_user_id AND preference.email_enabled))
           )
         RETURNING delivery.alert_id`,
      );
      for (const { alert_id: alertId } of suppressed.rows)
        await finalizeParent(client, alertId);
      return suppressed.rowCount ?? 0;
    });
  }

  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    return transaction(this.pool, async (client) => {
      const failed = await client.query<{ alert_id: string }>(
        `UPDATE audit_alert_deliveries delivery
         SET failed_at = clock_timestamp(),
             lease_owner = NULL,
             lease_expires_at = NULL,
             last_error = COALESCE(last_error, 'delivery worker stopped during the final attempt')
         WHERE delivery.channel = 'email'
           AND delivery.delivered_at IS NULL
           AND delivery.failed_at IS NULL
           AND delivery.suppressed_at IS NULL
           AND delivery.uncertain_at IS NULL
           AND delivery.attempt_count >= $1
           AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at <= clock_timestamp())
         RETURNING delivery.alert_id`,
        [maxAttempts],
      );
      for (const { alert_id: alertId } of failed.rows)
        await finalizeParent(client, alertId);
      return failed.rowCount ?? 0;
    });
  }

  async claim(
    lease: OutboxLease,
    maxAttempts: number,
  ): Promise<ClaimedAuditAlert | null> {
    const result = await this.pool.query<ClaimedAuditAlert>(
      `WITH candidate AS (
         SELECT delivery.id, delivery.alert_id
         FROM audit_alert_deliveries delivery
         JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
         JOIN team_members member
           ON member.team_id = delivery.team_id
          AND member.user_id = delivery.recipient_user_id
         JOIN "user" account ON account.id = member.user_id
         WHERE delivery.channel = 'email'
           AND delivery.delivered_at IS NULL
           AND delivery.failed_at IS NULL
           AND delivery.suppressed_at IS NULL
           AND delivery.uncertain_at IS NULL
           AND delivery.attempt_count < $3
           AND delivery.available_at <= clock_timestamp()
           AND (delivery.lease_expires_at IS NULL OR delivery.lease_expires_at <= clock_timestamp())
           AND alert.delivered_at IS NULL
           AND alert.failed_at IS NULL
           AND alert.suppressed_at IS NULL
           AND alert.uncertain_at IS NULL
           AND (alert.lease_expires_at IS NULL OR alert.lease_expires_at <= clock_timestamp())
           AND member.role IN ('owner', 'admin')
           AND account."emailVerified"
           AND NOT account.recovery_disabled
           AND (NOT EXISTS (SELECT 1 FROM audit_alert_preferences configured WHERE configured.team_id = delivery.team_id)
                OR EXISTS (SELECT 1 FROM audit_alert_preferences preference WHERE preference.team_id = delivery.team_id AND preference.recipient_user_id = delivery.recipient_user_id AND preference.email_enabled))
         ORDER BY delivery.available_at, delivery.created_at, delivery.id
         FOR UPDATE OF alert, delivery SKIP LOCKED
         LIMIT 1
       ), claimed_alert AS (
         UPDATE audit_alert_outbox alert
         SET lease_owner = $1,
             lease_expires_at = clock_timestamp() + make_interval(secs => $2::float / 1000),
             attempt_count = alert.attempt_count + 1
         FROM candidate
         WHERE alert.id = candidate.alert_id
         RETURNING alert.id
       ), claimed_delivery AS (
         UPDATE audit_alert_deliveries delivery
         SET lease_owner = $1,
             lease_expires_at = clock_timestamp() + make_interval(secs => $2::float / 1000),
             attempt_count = delivery.attempt_count + 1
         FROM candidate, claimed_alert
         WHERE delivery.id = candidate.id
         RETURNING delivery.id, delivery.alert_id, delivery.recipient_user_id,
                   delivery.attempt_count
       )
       SELECT delivery.id, delivery.alert_id AS "alertId",
              delivery.recipient_user_id AS "recipientUserId",
              account.email, alert.event_type AS "eventType",
              alert.created_at AS "occurredAt",
              delivery.attempt_count AS "attemptCount"
       FROM claimed_delivery delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       JOIN "user" account ON account.id = delivery.recipient_user_id`,
      [lease.owner, lease.durationMs, maxAttempts],
    );
    return result.rows[0] ?? null;
  }

  async remainsDeliverable(claim: ClaimedAuditAlert, lease: OutboxLease) {
    const result = await this.pool.query(
      `SELECT 1
       FROM audit_alert_deliveries delivery
       JOIN audit_alert_outbox alert ON alert.id = delivery.alert_id
       JOIN team_members member
         ON member.team_id = delivery.team_id
        AND member.user_id = delivery.recipient_user_id
       JOIN "user" account ON account.id = member.user_id
       WHERE delivery.id = $1
         AND delivery.lease_owner = $2
         AND alert.lease_owner = $2
         AND delivery.delivered_at IS NULL
         AND delivery.failed_at IS NULL
         AND delivery.suppressed_at IS NULL
         AND delivery.uncertain_at IS NULL
         AND member.role IN ('owner', 'admin')
         AND account."emailVerified"
         AND NOT account.recovery_disabled
         AND (NOT EXISTS (SELECT 1 FROM audit_alert_preferences configured WHERE configured.team_id = delivery.team_id)
              OR EXISTS (SELECT 1 FROM audit_alert_preferences preference WHERE preference.team_id = delivery.team_id AND preference.recipient_user_id = delivery.recipient_user_id AND preference.email_enabled))
         AND account.email = $3`,
      [claim.id, lease.owner, claim.email],
    );
    return result.rowCount === 1;
  }

  async suppressClaim(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE audit_alert_deliveries
         SET suppressed_at = clock_timestamp(), lease_owner = NULL,
             lease_expires_at = NULL,
             last_error = 'recipient is no longer deliverable'
         WHERE id = $1 AND lease_owner = $2
           AND delivered_at IS NULL AND failed_at IS NULL
           AND suppressed_at IS NULL AND uncertain_at IS NULL`,
        [claim.id, lease.owner],
      );
      if (result.rowCount === 1)
        await finalizeParent(client, claim.alertId, lease.owner);
      return result.rowCount === 1;
    });
  }

  async renewLease(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const parent = await client.query(
        `UPDATE audit_alert_outbox
         SET lease_expires_at = clock_timestamp() + make_interval(secs => $3::float / 1000)
         WHERE id = $1 AND lease_owner = $2
           AND delivered_at IS NULL AND failed_at IS NULL
           AND suppressed_at IS NULL AND uncertain_at IS NULL`,
        [claim.alertId, lease.owner, lease.durationMs],
      );
      if (parent.rowCount !== 1) return false;
      const delivery = await client.query(
        `UPDATE audit_alert_deliveries
         SET lease_expires_at = clock_timestamp() + make_interval(secs => $3::float / 1000)
         WHERE id = $1 AND lease_owner = $2
           AND delivered_at IS NULL AND failed_at IS NULL
           AND suppressed_at IS NULL AND uncertain_at IS NULL`,
        [claim.id, lease.owner, lease.durationMs],
      );
      if (delivery.rowCount !== 1)
        throw new Error('audit alert child lease was lost during renewal');
      return true;
    });
  }

  async deliver(claim: ClaimedAuditAlert): Promise<void> {
    await this.mailer.sendAuditAlert({
      alertId: claim.alertId,
      email: claim.email,
      eventType: claim.eventType,
      occurredAt: claim.occurredAt,
      messageId: messageId(claim.alertId, claim.recipientUserId),
    });
  }

  async recordFailure(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
    error: unknown,
    retryDelayMs: number | null,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const terminal = retryDelayMs === null;
      const result = await client.query(
        `UPDATE audit_alert_deliveries
         SET lease_owner = NULL, lease_expires_at = NULL, last_error = $3,
             available_at = CASE WHEN $4::boolean THEN available_at
               ELSE clock_timestamp() + make_interval(secs => $5::float / 1000) END,
             failed_at = CASE WHEN $4::boolean THEN clock_timestamp() END
         WHERE id = $1 AND lease_owner = $2
           AND delivered_at IS NULL AND failed_at IS NULL
           AND suppressed_at IS NULL AND uncertain_at IS NULL`,
        [
          claim.id,
          lease.owner,
          errorMessage(error),
          terminal,
          retryDelayMs ?? 0,
        ],
      );
      if (result.rowCount === 1) {
        if (terminal) await finalizeParent(client, claim.alertId, lease.owner);
        else
          await client.query(
            `UPDATE audit_alert_outbox SET lease_owner = NULL, lease_expires_at = NULL,
                    available_at = clock_timestamp() + make_interval(secs => $3::float / 1000),
                    last_error = $4
             WHERE id = $1 AND lease_owner = $2`,
            [claim.alertId, lease.owner, retryDelayMs, errorMessage(error)],
          );
      }
      return result.rowCount === 1;
    });
  }

  async recordComplete(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE audit_alert_deliveries
         SET delivered_at = clock_timestamp(), lease_owner = NULL,
             lease_expires_at = NULL, last_error = NULL
         WHERE id = $1 AND lease_owner = $2
           AND delivered_at IS NULL AND failed_at IS NULL
           AND suppressed_at IS NULL AND uncertain_at IS NULL`,
        [claim.id, lease.owner],
      );
      if (result.rowCount === 1)
        await finalizeParent(client, claim.alertId, lease.owner);
      return result.rowCount === 1;
    });
  }

  async recordUncertain(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
    error: unknown,
  ): Promise<boolean> {
    return transaction(this.pool, async (client) => {
      const result = await client.query(
        `UPDATE audit_alert_deliveries
         SET uncertain_at = clock_timestamp(), lease_owner = NULL,
             lease_expires_at = NULL, last_error = $3
         WHERE id = $1 AND lease_owner = $2
           AND delivered_at IS NULL AND failed_at IS NULL
           AND suppressed_at IS NULL AND uncertain_at IS NULL`,
        [claim.id, lease.owner, errorMessage(error)],
      );
      if (result.rowCount === 1)
        await finalizeParent(client, claim.alertId, lease.owner);
      return result.rowCount === 1;
    });
  }
}

export class AuditAlertDeliveryDispatcher {
  private readonly dispatcher: OutboxDispatcher<ClaimedAuditAlert>;

  constructor(options: AuditAlertDeliveryOptions) {
    this.dispatcher = new OutboxDispatcher({
      ...options,
      adapter: new AuditAlertDeliveryAdapter(options),
      roleError: (role) => new AuditAlertDeliveryRoleError(role),
    });
  }

  runOnce() {
    return this.dispatcher.runOnce();
  }
}

export type AuditAlertDeliveryWorker = OutboxWorker;

export function startAuditAlertDeliveryWorker(
  options: AuditAlertDeliveryOptions & {
    reportError?: (error: unknown) => void;
    pollIntervalMs?: number;
    drainLimit?: number;
  },
): AuditAlertDeliveryWorker {
  const dispatcher = new AuditAlertDeliveryDispatcher(options);
  return startOutboxWorker({
    ...options,
    queue: QUEUE,
    runOnce: () => dispatcher.runOnce(),
    onError: (error) => {
      logOperational('STUDIO_AUDIT_ALERT_WORKER_ERROR');
      options.reportError?.(error);
    },
  });
}
