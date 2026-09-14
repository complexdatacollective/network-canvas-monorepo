import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { InvitationMailer } from '../auth/email.ts';
import { logOperational } from '../observability/logger.ts';
import {
  OutboxDispatcher,
  type OutboxAdapter,
  type OutboxLease,
  type OutboxRetryOptions,
} from '../outbox/dispatcher.ts';
import type { OutboxObserver } from '../outbox/instrumentation.ts';
import { startOutboxWorker, type OutboxWorker } from '../outbox/worker.ts';

const INVITATION_DELIVERY_QUEUE = 'team_invitation_deliveries';
const MAX_ERROR_LENGTH = 1_000;

type ClaimedInvitationDelivery = {
  id: string;
  invitationId: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  teamLabel: string;
  inviterLabel: string;
  expiresAt: Date;
  attemptCount: number;
};

export type InvitationDeliveryResult = {
  claimed: number;
  sent: number;
  failed: number;
  suppressed: number;
};

export type InvitationDeliveryDispatcherOptions = OutboxRetryOptions & {
  pool: pg.Pool;
  mailer: InvitationMailer;
  publicBaseUrl: string;
  observer?: OutboxObserver;
};

export class InvitationDeliveryRoleError extends Error {
  constructor(role: string) {
    super(
      `invitation delivery must run as ${TENANT_ROLES.maintenance}, not ${role}`,
    );
    this.name = 'InvitationDeliveryRoleError';
  }
}

function invitationMessageId(invitationId: string): string {
  return `<studio-invitation.${invitationId}@networkcanvas.local>`;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    MAX_ERROR_LENGTH,
  );
}

class InvitationDeliveryAdapter implements OutboxAdapter<ClaimedInvitationDelivery> {
  readonly queue = INVITATION_DELIVERY_QUEUE;
  private readonly pool: pg.Pool;
  private readonly mailer: InvitationMailer;
  private readonly publicBaseUrl: URL;

  constructor(options: InvitationDeliveryDispatcherOptions) {
    this.pool = options.pool;
    this.mailer = options.mailer;
    this.publicBaseUrl = new URL(options.publicBaseUrl);
  }

  async suppressUndeliverable(): Promise<number> {
    const suppressed = await this.pool.query(
      `UPDATE team_invitation_deliveries delivery
       SET suppressed_at = clock_timestamp(),
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = CASE
             WHEN invitation.status = 'pending' THEN 'invitation expired'
             ELSE 'invitation is no longer pending'
           END
       FROM team_invitations invitation
       WHERE delivery.invitation_id = invitation.id
         AND delivery.sent_at IS NULL
         AND delivery.failed_at IS NULL
         AND delivery.suppressed_at IS NULL
         AND delivery.uncertain_at IS NULL
         AND (
           delivery.lease_expires_at IS NULL
           OR delivery.lease_expires_at <= clock_timestamp()
         )
         AND (
           invitation.status <> 'pending'
           OR invitation.expires_at <= clock_timestamp()
         )`,
    );
    return suppressed.rowCount ?? 0;
  }

  async failExhaustedLeases(maxAttempts: number): Promise<number> {
    const failed = await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET failed_at = clock_timestamp(),
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = COALESCE(
             last_error,
             'delivery worker stopped during the final attempt'
           )
       WHERE sent_at IS NULL
         AND failed_at IS NULL
         AND suppressed_at IS NULL
         AND uncertain_at IS NULL
         AND attempt_count >= $1
         AND (
           lease_expires_at IS NULL
           OR lease_expires_at <= clock_timestamp()
         )`,
      [maxAttempts],
    );
    return failed.rowCount ?? 0;
  }

  async claim(
    lease: OutboxLease,
    maxAttempts: number,
  ): Promise<ClaimedInvitationDelivery | null> {
    const claimed = await this.pool.query<ClaimedInvitationDelivery>(
      `WITH candidate AS (
         SELECT delivery.id,
                invitation.team_id,
                invitation.id AS invitation_id
         FROM team_invitation_deliveries delivery
         JOIN team_invitations invitation
           ON invitation.id = delivery.invitation_id
         WHERE delivery.sent_at IS NULL
           AND delivery.failed_at IS NULL
           AND delivery.suppressed_at IS NULL
           AND delivery.uncertain_at IS NULL
           AND delivery.attempt_count < $3
           AND delivery.available_at <= clock_timestamp()
           AND (
             delivery.lease_expires_at IS NULL
             OR delivery.lease_expires_at <= clock_timestamp()
           )
           AND invitation.status = 'pending'
           AND invitation.expires_at > clock_timestamp()
         ORDER BY delivery.available_at, delivery.created_at, delivery.id
         FOR UPDATE OF invitation, delivery SKIP LOCKED
         LIMIT 1
       ), coordinated_candidate AS (
         SELECT id
         FROM candidate
         WHERE pg_try_advisory_xact_lock(
           hashtext(team_id),
           hashtext(invitation_id)
         )
       )
       UPDATE team_invitation_deliveries delivery
       SET lease_owner = $1,
           lease_expires_at = clock_timestamp() + make_interval(secs => $2::float / 1000),
           attempt_count = delivery.attempt_count + 1
       FROM coordinated_candidate candidate
       WHERE delivery.id = candidate.id
       RETURNING delivery.id,
                 delivery.invitation_id AS "invitationId",
                 delivery.email,
                 delivery.role,
                 delivery.team_label AS "teamLabel",
                 delivery.inviter_label AS "inviterLabel",
                 delivery.expires_at AS "expiresAt",
                 delivery.attempt_count AS "attemptCount"`,
      [lease.owner, lease.durationMs, maxAttempts],
    );
    return claimed.rows[0] ?? null;
  }

  async remainsDeliverable(
    claim: ClaimedInvitationDelivery,
    lease: OutboxLease,
  ) {
    const current = await this.pool.query(
      `SELECT 1
       FROM team_invitation_deliveries delivery
       JOIN team_invitations invitation
         ON invitation.id = delivery.invitation_id
       WHERE delivery.id = $1
         AND delivery.lease_owner = $2
         AND delivery.sent_at IS NULL
         AND delivery.failed_at IS NULL
         AND delivery.suppressed_at IS NULL
         AND delivery.uncertain_at IS NULL
         AND invitation.status = 'pending'
         AND invitation.expires_at > clock_timestamp()`,
      [claim.id, lease.owner],
    );
    return current.rowCount === 1;
  }

  async suppressClaim(
    claim: ClaimedInvitationDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    const suppressed = await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET suppressed_at = clock_timestamp(),
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = 'invitation is no longer deliverable'
       WHERE id = $1
         AND lease_owner = $2
         AND sent_at IS NULL
         AND failed_at IS NULL
         AND suppressed_at IS NULL
         AND uncertain_at IS NULL`,
      [claim.id, lease.owner],
    );
    return suppressed.rowCount === 1;
  }

  async renewLease(
    claim: ClaimedInvitationDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    const renewed = await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET lease_expires_at = clock_timestamp()
         + make_interval(secs => $3::float / 1000)
       WHERE id = $1
         AND lease_owner = $2
         AND sent_at IS NULL
         AND failed_at IS NULL
         AND suppressed_at IS NULL
         AND uncertain_at IS NULL`,
      [claim.id, lease.owner, lease.durationMs],
    );
    return renewed.rowCount === 1;
  }

  async recordFailure(
    claim: ClaimedInvitationDelivery,
    lease: OutboxLease,
    error: unknown,
    retryDelayMs: number | null,
  ): Promise<boolean> {
    const exhausted = retryDelayMs === null;
    const recorded = await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = $3,
           available_at = CASE
             WHEN $4::boolean THEN available_at
             ELSE clock_timestamp() + make_interval(secs => $5::float / 1000)
           END,
           failed_at = CASE WHEN $4::boolean THEN clock_timestamp() ELSE NULL END
       WHERE id = $1
         AND lease_owner = $2
         AND sent_at IS NULL
         AND failed_at IS NULL
         AND suppressed_at IS NULL
         AND uncertain_at IS NULL`,
      [
        claim.id,
        lease.owner,
        errorMessage(error),
        exhausted,
        retryDelayMs ?? 0,
      ],
    );
    return recorded.rowCount === 1;
  }

  async recordComplete(
    claim: ClaimedInvitationDelivery,
    lease: OutboxLease,
  ): Promise<boolean> {
    const sent = await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET sent_at = clock_timestamp(),
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = NULL
       WHERE id = $1
         AND lease_owner = $2
         AND sent_at IS NULL
         AND failed_at IS NULL
         AND suppressed_at IS NULL
         AND uncertain_at IS NULL`,
      [claim.id, lease.owner],
    );
    return sent.rowCount === 1;
  }

  /**
   * SMTP has accepted the message, but Studio could not prove that its sent
   * marker committed. This is terminal for automatic dispatch: retrying could
   * duplicate mail. A process crash still leaves the lease reclaimable, which
   * preserves the outbox's at-least-once crash semantics.
   */
  async recordUncertain(
    claim: ClaimedInvitationDelivery,
    lease: OutboxLease,
    error: unknown,
  ): Promise<boolean> {
    const uncertain = await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET uncertain_at = clock_timestamp(),
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = $3
       WHERE id = $1
         AND lease_owner = $2
         AND sent_at IS NULL
         AND failed_at IS NULL
         AND suppressed_at IS NULL
         AND uncertain_at IS NULL`,
      [claim.id, lease.owner, errorMessage(error)],
    );
    return uncertain.rowCount === 1;
  }

  async deliver(claim: ClaimedInvitationDelivery): Promise<void> {
    const invitationUrl = new URL(
      `/invitations/${encodeURIComponent(claim.invitationId)}`,
      this.publicBaseUrl,
    ).toString();
    await this.mailer.sendTeamInvitation({
      email: claim.email,
      expiresAt: claim.expiresAt,
      invitationUrl,
      inviterLabel: claim.inviterLabel,
      messageId: invitationMessageId(claim.invitationId),
      role: claim.role,
      teamLabel: claim.teamLabel,
    });
  }
}

/** Existing callers retain invitation-specific names and attempt counts. */
export class InvitationDeliveryDispatcher {
  private readonly dispatcher: OutboxDispatcher<ClaimedInvitationDelivery>;

  constructor(options: InvitationDeliveryDispatcherOptions) {
    this.dispatcher = new OutboxDispatcher({
      ...options,
      adapter: new InvitationDeliveryAdapter(options),
      roleError: (role) => new InvitationDeliveryRoleError(role),
    });
  }

  async runOnce(): Promise<InvitationDeliveryResult> {
    const result = await this.dispatcher.runOnce();
    return {
      claimed: result.claimed,
      sent: result.completed,
      // The established public result counts both retryable attempts and
      // exhausted rows as failed. Lifecycle metrics distinguish them.
      failed: result.failed + result.retried,
      suppressed: result.suppressed,
    };
  }
}

export type InvitationDeliveryWorkerOptions =
  InvitationDeliveryDispatcherOptions & {
    pollIntervalMs?: number;
    drainLimit?: number;
  };

export type InvitationDeliveryWorker = OutboxWorker;

export function startInvitationDeliveryWorker(
  options: InvitationDeliveryWorkerOptions,
): InvitationDeliveryWorker {
  const dispatcher = new InvitationDeliveryDispatcher(options);
  return startOutboxWorker({
    ...options,
    queue: INVITATION_DELIVERY_QUEUE,
    runOnce: () => dispatcher.runOnce(),
    onError: () => logOperational('STUDIO_INVITATION_WORKER_ERROR'),
  });
}
