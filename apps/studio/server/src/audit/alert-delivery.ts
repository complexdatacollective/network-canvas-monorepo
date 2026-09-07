import type pg from 'pg';

import { AuditAlertPolicySchema } from '@codaco/studio-rpc';
import {
  EmailDeliveryError,
  type EmailSender,
} from '@codaco/studio-sync/email-sender';
import { TEAM_GUC } from '@codaco/studio-sync/rls';

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
import { ALERT_BACKLOG_DAYS } from './alert-policy.ts';
import { grantsAuditRead } from './read-authorization.ts';
import {
  AUDIT_SEQUENCE_LOCK_SEED,
  AUDIT_TEAM_LOCK_KEY_SQL,
  lockAuditTeam,
} from './store.ts';

const PENDING =
  'delivered_at IS NULL AND failed_at IS NULL AND suppressed_at IS NULL AND uncertain_at IS NULL';
const OWNED = `id = $1 AND lease_owner = $2 AND ${PENDING}`;
const QUEUE = 'audit_alert_outbox';
const RATE_LOCK = 'studio-audit-alert-email-admission';
export const ALERT_EMAIL_TEAM_LIMIT = 10;
export const ALERT_EMAIL_DEPLOYMENT_LIMIT = 60;

export type ClaimedAuditAlert = {
  id: string;
  teamId: string;
  outboxId: string;
  eventId: string;
  policy: string;
  memberId: string;
  recipientId: string;
  userId: string;
  channel: 'in_app' | 'email';
  createdAt: Date;
  attemptCount: number;
  leaseOwner: string;
};

type Options = OutboxRetryOptions & {
  pool: pg.Pool;
  mailer?: AuditAlertMailer;
  publicBaseUrl: string;
  observer?: OutboxObserver;
};

/** Read only the current verified researcher address; never snapshot it in work. */
async function eligibleRecipient(
  client: pg.PoolClient,
  claim: ClaimedAuditAlert,
) {
  const rows = await client.query<{ email: string; role: string }>(
    `SELECT u.email, m.role FROM audit_alert_recipients r
    JOIN team_members m ON m.id = r.member_id AND m.team_id = r.team_id AND m.user_id = r.user_id
    JOIN "user" u ON u.id = m.user_id AND u."emailVerified"
    JOIN teams t ON t.id = r.team_id
    WHERE r.id = $1 AND r.team_id = $2 AND r.member_id = $3 AND r.user_id = $4
      AND CASE WHEN $5 = 'email' THEN r.email ELSE r.in_app END
    FOR SHARE OF r, m, u, t`,
    [
      claim.recipientId,
      claim.teamId,
      claim.memberId,
      claim.userId,
      claim.channel,
    ],
  );
  const row = rows.rows[0];
  return row && grantsAuditRead(row.role) ? row.email : null;
}

export class AuditAlertDeliveryAdapter implements OutboxAdapter<ClaimedAuditAlert> {
  readonly queue = QUEUE;
  private readonly options: Options;
  constructor(options: Options) {
    this.options = options;
  }
  private get pool() {
    return this.options.pool;
  }

  failureDisposition(error: unknown) {
    return error instanceof EmailDeliveryError
      ? error.disposition
      : 'uncertain';
  }

  async suppressUndeliverable(): Promise<number> {
    const suppressed = await this.pool.query(
      `WITH candidates AS (
      SELECT d.id FROM audit_alert_deliveries d WHERE ${PENDING}
        AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
        AND send_started_at IS NULL
        AND (d.created_at < clock_timestamp() - make_interval(days => $1)
          OR NOT EXISTS (SELECT 1 FROM audit_alert_recipients r
            JOIN team_members m ON m.id = r.member_id AND m.team_id = r.team_id AND m.user_id = r.user_id
            JOIN "user" u ON u.id = r.user_id AND u."emailVerified"
            JOIN teams t ON t.id = r.team_id
            WHERE r.id = d.recipient_id AND r.team_id = d.team_id AND r.member_id = d.member_id AND r.user_id = d.user_id
              AND CASE WHEN d.channel = 'email' THEN r.email ELSE r.in_app END))
      ORDER BY d.created_at, d.id FOR UPDATE SKIP LOCKED LIMIT 100
    ) UPDATE audit_alert_deliveries d SET suppressed_at = clock_timestamp(), lease_owner = NULL, lease_expires_at = NULL,
      last_error = CASE WHEN d.created_at < clock_timestamp() - make_interval(days => $1) THEN 'backlog_expired' ELSE 'not_eligible' END
      FROM candidates c WHERE d.id = c.id`,
      [ALERT_BACKLOG_DAYS],
    );
    // Role parsing remains the same JS predicate used by RPC/audit reads and
    // is rechecked under locks for claimed work, including malformed role lists.
    await this.finishParents();
    return suppressed.rowCount ?? 0;
  }

  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    const failed = await this.pool.query(
      `WITH candidates AS (
      SELECT id FROM audit_alert_deliveries WHERE ${PENDING}
        AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
        AND (send_started_at IS NOT NULL OR attempt_count >= $1)
      ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 100
    ) UPDATE audit_alert_deliveries d SET
      uncertain_at = CASE WHEN send_started_at IS NOT NULL THEN clock_timestamp() ELSE NULL END,
      failed_at = CASE WHEN send_started_at IS NULL THEN clock_timestamp() ELSE NULL END,
      last_error = CASE WHEN send_started_at IS NOT NULL THEN 'handoff_interrupted' ELSE 'attempts_exhausted' END,
      lease_owner = NULL, lease_expires_at = NULL FROM candidates c WHERE d.id = c.id
      RETURNING d.failed_at`,
      [maxAttempts],
    );
    await this.finishParents();
    return failed.rows.filter(
      (row: { failed_at: Date | null }) => row.failed_at !== null,
    ).length;
  }

  async claim(
    lease: OutboxLease,
    maxAttempts: number,
  ): Promise<ClaimedAuditAlert | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const candidate = await client.query<
        Omit<ClaimedAuditAlert, 'leaseOwner'>
      >(
        `SELECT d.id, d.team_id AS "teamId", d.outbox_id AS "outboxId", d.recipient_id AS "recipientId", d.member_id AS "memberId", d.user_id AS "userId", d.channel, d.created_at AS "createdAt", d.attempt_count AS "attemptCount", o.audit_event_id AS "eventId", o.alert_policy_key AS policy
        FROM audit_alert_deliveries d JOIN audit_alert_outbox o ON o.id = d.outbox_id AND o.team_id = d.team_id
        WHERE d.delivered_at IS NULL AND d.failed_at IS NULL AND d.suppressed_at IS NULL AND d.uncertain_at IS NULL
          AND d.send_started_at IS NULL AND d.attempt_count < $1 AND d.available_at <= clock_timestamp()
          AND (d.lease_expires_at IS NULL OR d.lease_expires_at <= clock_timestamp())
          AND (d.channel <> 'email' OR $2::boolean)
        ORDER BY d.available_at, d.created_at, d.id FOR UPDATE OF d SKIP LOCKED LIMIT 1`,
        [maxAttempts, Boolean(this.options.mailer)],
      );
      const row = candidate.rows[0];
      if (!row) return null;
      const lock = await client.query<{ locked: boolean }>(
        `SELECT pg_try_advisory_xact_lock(${AUDIT_TEAM_LOCK_KEY_SQL}) AS locked`,
        [row.teamId, AUDIT_SEQUENCE_LOCK_SEED.toString()],
      );
      if (!lock.rows[0]?.locked) return null;
      if (
        row.channel === 'email' &&
        !(await this.reserveEmailCapacity(client, row))
      ) {
        await client.query('COMMIT');
        return null;
      }
      const claimed = await client.query(
        `UPDATE audit_alert_deliveries SET lease_owner = $2, lease_expires_at = clock_timestamp() + make_interval(secs => $3::float / 1000), attempt_count = attempt_count + 1 WHERE id = $1`,
        [row.id, lease.owner, lease.durationMs],
      );
      if (claimed.rowCount !== 1) throw new Error('audit alert claim failed');
      await client.query('COMMIT');
      return {
        ...row,
        attemptCount: row.attemptCount + 1,
        leaseOwner: lease.owner,
      };
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  private async reserveEmailCapacity(
    client: pg.PoolClient,
    claim: Omit<ClaimedAuditAlert, 'leaseOwner'>,
  ): Promise<boolean> {
    const lock = await client.query<{ locked: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtextextended(current_schema() || $1, 0)) AS locked`,
      [RATE_LOCK],
    );
    if (!lock.rows[0]?.locked) return false;
    const scopes = ['global', `team:${claim.teamId}`];
    for (const scope of scopes)
      await client.query(
        `INSERT INTO audit_alert_dispatch_budget (scope, window_started_at, attempts) VALUES ($1, date_trunc('minute', clock_timestamp()), 0)
      ON CONFLICT (scope) DO UPDATE SET window_started_at = CASE WHEN audit_alert_dispatch_budget.window_started_at < date_trunc('minute', clock_timestamp()) THEN date_trunc('minute', clock_timestamp()) ELSE audit_alert_dispatch_budget.window_started_at END,
      attempts = CASE WHEN audit_alert_dispatch_budget.window_started_at < date_trunc('minute', clock_timestamp()) THEN 0 ELSE audit_alert_dispatch_budget.attempts END`,
        [scope],
      );
    const capacity = await client.query<{ full: boolean; available_at: Date }>(
      `SELECT bool_or(attempts >= CASE WHEN scope = 'global' THEN $2::integer ELSE $3::integer END) AS full, max(window_started_at + interval '1 minute') AS available_at FROM audit_alert_dispatch_budget WHERE scope = ANY($1::text[])`,
      [scopes, ALERT_EMAIL_DEPLOYMENT_LIMIT, ALERT_EMAIL_TEAM_LIMIT],
    );
    if (capacity.rows[0]?.full) {
      await client.query(
        'UPDATE audit_alert_deliveries SET available_at = $2 WHERE id = $1',
        [claim.id, capacity.rows[0].available_at],
      );
      return false;
    }
    await client.query(
      'UPDATE audit_alert_dispatch_budget SET attempts = attempts + 1 WHERE scope = ANY($1::text[])',
      [scopes],
    );
    return true;
  }

  async remainsDeliverable(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
  ): Promise<boolean> {
    return (
      (
        await this.pool.query(
          `SELECT 1 FROM audit_alert_deliveries WHERE ${OWNED} AND created_at >= clock_timestamp() - make_interval(days => $3)`,
          [claim.id, lease.owner, ALERT_BACKLOG_DAYS],
        )
      ).rowCount === 1
    );
  }

  async deliver(claim: ClaimedAuditAlert): Promise<void | 'suppressed'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config($1, $2, true)`, [
        TEAM_GUC,
        claim.teamId,
      ]);
      await lockAuditTeam(client, claim.teamId);
      const email = await eligibleRecipient(client, claim);
      if (!email) return 'suppressed';
      // Read the linked immutable event only with an explicit tenant scope.
      const event = await client.query<{ occurred_at: Date }>(
        'SELECT occurred_at FROM audit_events WHERE id = $1 AND team_id = $2',
        [claim.eventId, claim.teamId],
      );
      const policy = AuditAlertPolicySchema.safeParse(claim.policy);
      if (!event.rows[0] || !policy.success) return 'suppressed';
      if (claim.channel === 'email') {
        const handoff = await this.pool.query(
          `UPDATE audit_alert_deliveries SET send_started_at = clock_timestamp() WHERE id = $1 AND lease_owner = $2 AND ${PENDING} AND send_started_at IS NULL AND lease_expires_at > clock_timestamp()`,
          [claim.id, claim.leaseOwner],
        );
        if (handoff.rowCount !== 1) return 'suppressed';
        const mailer = this.options.mailer;
        if (!mailer) throw new EmailDeliveryError('retryable');
        await mailer.sendAuditAlert({
          email,
          policy: policy.data,
          occurredAt: event.rows[0].occurred_at,
          alertUrl: new URL(
            `/team/${encodeURIComponent(claim.teamId)}/settings?alerts=1`,
            this.options.publicBaseUrl,
          ).href,
          messageId: `<audit-alert-${claim.id}@studio.networkcanvas.com>`,
        });
      }
      await client.query('COMMIT');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  async renewLease(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
  ): Promise<boolean> {
    return (
      (
        await this.pool.query(
          `UPDATE audit_alert_deliveries SET lease_expires_at = clock_timestamp() + make_interval(secs => $3::float / 1000) WHERE ${OWNED}`,
          [claim.id, lease.owner, lease.durationMs],
        )
      ).rowCount === 1
    );
  }
  async suppressClaim(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
  ): Promise<boolean> {
    return this.finish(
      claim,
      lease,
      `suppressed_at = clock_timestamp(), last_error = 'not_eligible'`,
    );
  }
  async recordFailure(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
    _error: unknown,
    retryDelayMs: number | null,
  ): Promise<boolean> {
    if (retryDelayMs === null)
      return this.finish(
        claim,
        lease,
        `failed_at = clock_timestamp(), last_error = 'send_rejected'`,
      );
    return (
      (
        await this.pool.query(
          `UPDATE audit_alert_deliveries SET send_started_at = NULL, lease_owner = NULL, lease_expires_at = NULL, last_error = 'send_retryable', available_at = clock_timestamp() + make_interval(secs => $3::float / 1000) WHERE ${OWNED}`,
          [claim.id, lease.owner, retryDelayMs],
        )
      ).rowCount === 1
    );
  }
  async recordComplete(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
  ): Promise<boolean> {
    return this.finish(
      claim,
      lease,
      'delivered_at = clock_timestamp(), last_error = NULL',
    );
  }
  async recordUncertain(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
    _error: unknown,
  ): Promise<boolean> {
    return this.finish(
      claim,
      lease,
      `uncertain_at = clock_timestamp(), last_error = 'send_uncertain'`,
    );
  }
  private async finish(
    claim: ClaimedAuditAlert,
    lease: OutboxLease,
    assignments: string,
  ): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE audit_alert_deliveries SET ${assignments}, lease_owner = NULL, lease_expires_at = NULL WHERE ${OWNED}`,
      [claim.id, lease.owner],
    );
    await this.finishParents();
    return result.rowCount === 1;
  }
  private async finishParents(): Promise<void> {
    await this.pool.query(`WITH finished AS (
      SELECT o.id FROM audit_alert_outbox o WHERE o.delivered_at IS NULL AND o.failed_at IS NULL AND o.suppressed_at IS NULL AND o.uncertain_at IS NULL
        AND EXISTS (SELECT 1 FROM audit_alert_deliveries d WHERE d.outbox_id = o.id)
        AND NOT EXISTS (SELECT 1 FROM audit_alert_deliveries d WHERE d.outbox_id = o.id AND ${PENDING})
      ORDER BY o.created_at, o.id FOR UPDATE OF o SKIP LOCKED LIMIT 100
    ), outcomes AS (SELECT f.id, bool_or(d.uncertain_at IS NOT NULL) AS uncertain, bool_or(d.failed_at IS NOT NULL) AS failed, bool_and(d.suppressed_at IS NOT NULL) AS suppressed FROM finished f JOIN audit_alert_deliveries d ON d.outbox_id = f.id GROUP BY f.id)
    UPDATE audit_alert_outbox o SET
      uncertain_at = CASE WHEN x.uncertain THEN clock_timestamp() ELSE NULL END,
      failed_at = CASE WHEN NOT x.uncertain AND x.failed THEN clock_timestamp() ELSE NULL END,
      suppressed_at = CASE WHEN NOT x.uncertain AND NOT x.failed AND x.suppressed THEN clock_timestamp() ELSE NULL END,
      delivered_at = CASE WHEN NOT x.uncertain AND NOT x.failed AND NOT x.suppressed THEN clock_timestamp() ELSE NULL END
    FROM outcomes x WHERE o.id = x.id`);
  }
}

export function createAuditAlertDispatcher(options: Options) {
  return new OutboxDispatcher({
    ...options,
    adapter: new AuditAlertDeliveryAdapter(options),
  });
}

export type AuditAlertWorker = OutboxWorker;

type AuditAlertWorkerOptions = Options & {
  reportError?: (error: unknown) => void;
  mailer?: AuditAlertMailer & Pick<EmailSender, 'close'>;
  pollIntervalMs?: number;
  drainLimit?: number;
};

export function startAuditAlertWorker(
  options: AuditAlertWorkerOptions,
): AuditAlertWorker {
  const dispatcher = createAuditAlertDispatcher(options);
  const worker = startOutboxWorker({
    ...options,
    queue: QUEUE,
    runOnce: () => dispatcher.runOnce(),
    onError: (error) => {
      logOperational('STUDIO_AUDIT_ALERT_WORKER_ERROR');
      options.reportError?.(error);
    },
  });
  return {
    stop() {
      const stopped = worker.stop();
      options.mailer?.close();
      return stopped;
    },
  };
}
