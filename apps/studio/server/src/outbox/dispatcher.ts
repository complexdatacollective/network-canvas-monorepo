import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  observeOutbox,
  type OutboxDispatchResult,
  type OutboxObserver,
  type OutboxQueue,
} from './instrumentation.ts';

export type OutboxClaim = { attemptCount: number };

export type OutboxLease = Readonly<{ owner: string; durationMs: number }>;

export type OutboxRetryOptions = {
  leaseMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
};

/**
 * Adapters own SQL and domain policy, including SKIP LOCKED and the domain's
 * advisory-xact-lock at claim time. Every write must compare lease ownership
 * and exclude terminal rows; false means this worker no longer owns the row.
 * Only the engine decides when to renew, retry, finalize or stop an attempt.
 */
export type OutboxAdapter<Claim extends OutboxClaim> = {
  queue: OutboxQueue;
  suppressUndeliverable(): Promise<number>;
  failExhaustedLeases(maxAttempts: number): Promise<number>;
  claim(lease: OutboxLease, maxAttempts: number): Promise<Claim | null>;
  remainsDeliverable(claim: Claim, lease: OutboxLease): Promise<boolean>;
  suppressClaim(claim: Claim, lease: OutboxLease): Promise<boolean>;
  renewLease(claim: Claim, lease: OutboxLease): Promise<boolean>;
  deliver(claim: Claim): Promise<void>;
  recordFailure(
    claim: Claim,
    lease: OutboxLease,
    error: unknown,
    /** Null marks a terminal failure; a number schedules the next attempt. */
    retryDelayMs: number | null,
  ): Promise<boolean>;
  recordComplete(claim: Claim, lease: OutboxLease): Promise<boolean>;
  recordUncertain(
    claim: Claim,
    lease: OutboxLease,
    error: unknown,
  ): Promise<boolean>;
};

type OutboxDispatcherOptions<Claim extends OutboxClaim> = OutboxRetryOptions & {
  pool: pg.Pool;
  adapter: OutboxAdapter<Claim>;
  observer?: OutboxObserver;
  roleError?: (role: string) => Error;
};

type LeaseHeartbeat = { stop(): Promise<boolean> };

export function requirePositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive finite number`);
  }
}

function requireNonNegativeFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative finite number`);
  }
}

export class OutboxDispatcher<Claim extends OutboxClaim> {
  private readonly pool: pg.Pool;
  private readonly adapter: OutboxAdapter<Claim>;
  private readonly observer: OutboxObserver | undefined;
  private readonly roleError: (role: string) => Error;
  private readonly lease: OutboxLease;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly retryMaxMs: number;
  private roleVerified = false;

  constructor(options: OutboxDispatcherOptions<Claim>) {
    this.pool = options.pool;
    this.adapter = options.adapter;
    this.observer = options.observer;
    this.roleError =
      options.roleError ??
      ((role) =>
        new Error(
          `${this.adapter.queue} must run as ${TENANT_ROLES.maintenance}, not ${role}`,
        ));
    this.lease = Object.freeze({
      owner: randomUUID(),
      durationMs: options.leaseMs ?? 60_000,
    });
    this.maxAttempts = options.maxAttempts ?? 8;
    this.retryBaseMs = options.retryBaseMs ?? 5_000;
    this.retryMaxMs = options.retryMaxMs ?? 30 * 60_000;
    requirePositiveFinite('leaseMs', this.lease.durationMs);
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
    if (role !== TENANT_ROLES.maintenance) throw this.roleError(role);
    this.roleVerified = true;
  }

  private startLeaseHeartbeat(claim: Claim): LeaseHeartbeat {
    const heartbeatMs = Math.max(1, Math.floor(this.lease.durationMs / 3));
    let ownsLease = true;
    let stopped = false;
    let timer: NodeJS.Timeout | undefined;
    let active: Promise<void> = Promise.resolve();

    const schedule = () => {
      if (stopped || !ownsLease) return;
      timer = setTimeout(() => {
        active = Promise.resolve()
          .then(() => this.adapter.renewLease(claim, this.lease))
          .then((renewed) => {
            ownsLease = renewed;
            observeOutbox(this.observer, {
              queue: this.adapter.queue,
              kind: 'heartbeat',
              outcome: renewed ? 'renewed' : 'lost',
            });
            return undefined;
          })
          .catch(() => {
            // A provider call cannot necessarily be canceled. Leave the row
            // reclaimable and never persist an outcome under uncertain ownership.
            ownsLease = false;
            observeOutbox(this.observer, {
              queue: this.adapter.queue,
              kind: 'heartbeat',
              outcome: 'error',
            });
          })
          .finally(schedule);
      }, heartbeatMs);
      timer.unref();
    };

    schedule();
    return {
      stop: async () => {
        stopped = true;
        if (timer) clearTimeout(timer);
        await active;
        return ownsLease;
      },
    };
  }

  private retryDelayMs(attemptCount: number): number {
    const exponent = Math.min(Math.max(attemptCount - 1, 0), 30);
    return Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** exponent);
  }

  private async dispatch(): Promise<OutboxDispatchResult> {
    await this.verifyRole();
    const suppressed = await this.adapter.suppressUndeliverable();
    const failed = await this.adapter.failExhaustedLeases(this.maxAttempts);
    const result: OutboxDispatchResult = {
      claimed: 0,
      completed: 0,
      retried: 0,
      failed,
      suppressed,
      uncertain: 0,
      leaseLost: 0,
    };
    const claim = await this.adapter.claim(this.lease, this.maxAttempts);
    if (!claim) return result;
    result.claimed = 1;

    if (!(await this.adapter.remainsDeliverable(claim, this.lease))) {
      if (await this.adapter.suppressClaim(claim, this.lease)) {
        result.suppressed += 1;
      } else {
        result.leaseLost = 1;
      }
      return result;
    }

    const heartbeat = this.startLeaseHeartbeat(claim);
    try {
      await this.adapter.deliver(claim);
    } catch (error) {
      if (!(await heartbeat.stop())) {
        result.leaseLost = 1;
        return result;
      }
      const retryDelay =
        claim.attemptCount >= this.maxAttempts
          ? null
          : this.retryDelayMs(claim.attemptCount);
      if (
        await this.adapter.recordFailure(claim, this.lease, error, retryDelay)
      ) {
        if (retryDelay === null) result.failed += 1;
        else result.retried = 1;
      } else {
        result.leaseLost = 1;
      }
      return result;
    }

    if (!(await heartbeat.stop())) {
      result.leaseLost = 1;
      return result;
    }

    // The provider accepted, but a failed commit must never become a normal
    // retry. A process crash still leaves the lease reclaimable: this retains
    // the invitation outbox's at-least-once crash semantics.
    let completionError: unknown;
    try {
      if (await this.adapter.recordComplete(claim, this.lease)) {
        result.completed = 1;
        return result;
      }
      completionError = new Error(
        'sent finalization did not retain delivery ownership',
      );
    } catch (error) {
      completionError = error;
    }
    if (
      await this.adapter.recordUncertain(claim, this.lease, completionError)
    ) {
      result.uncertain = 1;
    } else {
      result.leaseLost = 1;
    }
    return result;
  }

  async runOnce(): Promise<OutboxDispatchResult> {
    const started = performance.now();
    try {
      const result = await this.dispatch();
      observeOutbox(this.observer, {
        queue: this.adapter.queue,
        kind: 'dispatch',
        durationMs: performance.now() - started,
        ...result,
      });
      return result;
    } catch (error) {
      observeOutbox(this.observer, {
        queue: this.adapter.queue,
        kind: 'dispatch_error',
      });
      throw error;
    }
  }
}
