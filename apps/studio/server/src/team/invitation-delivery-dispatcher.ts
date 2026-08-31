import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import type { InvitationMailer } from '../auth/email.ts';

const DEFAULT_LEASE_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_RETRY_BASE_MS = 5_000;
const DEFAULT_RETRY_MAX_MS = 30 * 60_000;
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_DRAIN_LIMIT = 10;
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

export type InvitationDeliveryDispatcherOptions = {
  pool: pg.Pool;
  mailer: InvitationMailer;
  publicBaseUrl: string;
  leaseMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
};

export class InvitationDeliveryRoleError extends Error {
  constructor(role: string) {
    super(
      `invitation delivery must run as ${TENANT_ROLES.maintenance}, not ${role}`,
    );
    this.name = 'InvitationDeliveryRoleError';
  }
}

function requireNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
}

function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
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

export class InvitationDeliveryDispatcher {
  private readonly pool: pg.Pool;
  private readonly mailer: InvitationMailer;
  private readonly publicBaseUrl: URL;
  private readonly workerId = randomUUID();
  private readonly leaseMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private roleVerified = false;

  constructor(options: InvitationDeliveryDispatcherOptions) {
    this.pool = options.pool;
    this.mailer = options.mailer;
    this.publicBaseUrl = new URL(options.publicBaseUrl);
    this.leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.retryMaxMs = options.retryMaxMs ?? DEFAULT_RETRY_MAX_MS;
    requirePositiveFinite('leaseMs', this.leaseMs);
    requireNonNegativeFinite('retryBaseMs', this.retryBaseMs);
    requireNonNegativeFinite('retryMaxMs', this.retryMaxMs);
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('maxAttempts must be a positive integer');
    }
  }

  private async verifyRole(): Promise<void> {
    if (this.roleVerified) return;
    const current = await this.pool.query<{ role: string }>(
      `SELECT current_user AS role`,
    );
    const role = current.rows[0]?.role ?? '';
    if (role !== TENANT_ROLES.maintenance) {
      throw new InvitationDeliveryRoleError(role);
    }
    this.roleVerified = true;
  }

  private async suppressUndeliverable(): Promise<number> {
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

  private async failExhaustedLeases(): Promise<number> {
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
         AND attempt_count >= $1
         AND (
           lease_expires_at IS NULL
           OR lease_expires_at <= clock_timestamp()
         )`,
      [this.maxAttempts],
    );
    return failed.rowCount ?? 0;
  }

  private async claim(): Promise<ClaimedInvitationDelivery | null> {
    const claimed = await this.pool.query<ClaimedInvitationDelivery>(
      `WITH candidate AS (
         SELECT delivery.id
         FROM team_invitation_deliveries delivery
         JOIN team_invitations invitation
           ON invitation.id = delivery.invitation_id
         WHERE delivery.sent_at IS NULL
           AND delivery.failed_at IS NULL
           AND delivery.suppressed_at IS NULL
           AND delivery.attempt_count < $3
           AND delivery.available_at <= clock_timestamp()
           AND (
             delivery.lease_expires_at IS NULL
             OR delivery.lease_expires_at <= clock_timestamp()
           )
           AND invitation.status = 'pending'
           AND invitation.expires_at > clock_timestamp()
         ORDER BY delivery.available_at, delivery.created_at, delivery.id
         FOR UPDATE OF delivery SKIP LOCKED
         LIMIT 1
       )
       UPDATE team_invitation_deliveries delivery
       SET lease_owner = $1,
           lease_expires_at = clock_timestamp() + make_interval(secs => $2::float / 1000),
           attempt_count = delivery.attempt_count + 1
       FROM candidate
       WHERE delivery.id = candidate.id
       RETURNING delivery.id,
                 delivery.invitation_id AS "invitationId",
                 delivery.email,
                 delivery.role,
                 delivery.team_label AS "teamLabel",
                 delivery.inviter_label AS "inviterLabel",
                 delivery.expires_at AS "expiresAt",
                 delivery.attempt_count AS "attemptCount"`,
      [this.workerId, this.leaseMs, this.maxAttempts],
    );
    return claimed.rows[0] ?? null;
  }

  private async remainsDeliverable(claim: ClaimedInvitationDelivery) {
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
         AND invitation.status = 'pending'
         AND invitation.expires_at > clock_timestamp()`,
      [claim.id, this.workerId],
    );
    return current.rowCount === 1;
  }

  private async suppressClaim(claim: ClaimedInvitationDelivery): Promise<void> {
    await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET suppressed_at = clock_timestamp(),
           lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = 'invitation is no longer deliverable'
       WHERE id = $1 AND lease_owner = $2 AND sent_at IS NULL`,
      [claim.id, this.workerId],
    );
  }

  private retryDelayMs(attemptCount: number): number {
    const exponent = Math.min(Math.max(attemptCount - 1, 0), 30);
    return Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** exponent);
  }

  private async recordFailure(
    claim: ClaimedInvitationDelivery,
    error: unknown,
  ): Promise<void> {
    const exhausted = claim.attemptCount >= this.maxAttempts;
    await this.pool.query(
      `UPDATE team_invitation_deliveries
       SET lease_owner = NULL,
           lease_expires_at = NULL,
           last_error = $3,
           available_at = CASE
             WHEN $4::boolean THEN available_at
             ELSE clock_timestamp() + make_interval(secs => $5::float / 1000)
           END,
           failed_at = CASE WHEN $4::boolean THEN clock_timestamp() ELSE NULL END
       WHERE id = $1 AND lease_owner = $2 AND sent_at IS NULL`,
      [
        claim.id,
        this.workerId,
        errorMessage(error),
        exhausted,
        this.retryDelayMs(claim.attemptCount),
      ],
    );
  }

  async runOnce(): Promise<InvitationDeliveryResult> {
    await this.verifyRole();
    const suppressed = await this.suppressUndeliverable();
    const exhausted = await this.failExhaustedLeases();
    const claim = await this.claim();
    if (!claim) {
      return { claimed: 0, sent: 0, failed: exhausted, suppressed };
    }

    if (!(await this.remainsDeliverable(claim))) {
      await this.suppressClaim(claim);
      return {
        claimed: 1,
        sent: 0,
        failed: exhausted,
        suppressed: suppressed + 1,
      };
    }

    const invitationUrl = new URL(
      `/invitations/${encodeURIComponent(claim.invitationId)}`,
      this.publicBaseUrl,
    ).toString();
    try {
      await this.mailer.sendTeamInvitation({
        email: claim.email,
        expiresAt: claim.expiresAt,
        invitationUrl,
        inviterLabel: claim.inviterLabel,
        messageId: invitationMessageId(claim.invitationId),
        role: claim.role,
        teamLabel: claim.teamLabel,
      });
      await this.pool.query(
        `UPDATE team_invitation_deliveries
         SET sent_at = clock_timestamp(),
             lease_owner = NULL,
             lease_expires_at = NULL,
             last_error = NULL
         WHERE id = $1 AND lease_owner = $2 AND sent_at IS NULL`,
        [claim.id, this.workerId],
      );
      return { claimed: 1, sent: 1, failed: exhausted, suppressed };
    } catch (error) {
      await this.recordFailure(claim, error);
      return { claimed: 1, sent: 0, failed: exhausted + 1, suppressed };
    }
  }
}

export type InvitationDeliveryWorkerOptions =
  InvitationDeliveryDispatcherOptions & {
    pollIntervalMs?: number;
    drainLimit?: number;
  };

export type InvitationDeliveryWorker = {
  stop(): Promise<void>;
};

export function startInvitationDeliveryWorker(
  options: InvitationDeliveryWorkerOptions,
): InvitationDeliveryWorker {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const drainLimit = options.drainLimit ?? DEFAULT_DRAIN_LIMIT;
  requirePositiveFinite('pollIntervalMs', pollIntervalMs);
  if (!Number.isInteger(drainLimit) || drainLimit < 1) {
    throw new Error('drainLimit must be a positive integer');
  }

  const dispatcher = new InvitationDeliveryDispatcher(options);
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let active: Promise<void> = Promise.resolve();

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      active = (async () => {
        for (let index = 0; index < drainLimit; index += 1) {
          if (stopped) break;
          const result = await dispatcher.runOnce();
          if (result.claimed === 0) break;
        }
      })()
        .catch((error: unknown) => {
          // oxlint-disable-next-line no-console -- background worker diagnostics
          console.error('Invitation delivery worker failed:', error);
        })
        .finally(() => schedule(pollIntervalMs));
    }, delayMs);
    timer.unref();
  };

  schedule(0);

  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await active;
    },
  };
}
