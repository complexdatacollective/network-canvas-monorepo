import { logOperational } from '../observability/logger.ts';
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_MAX_WAITERS_PER_KEY = 25;
const DEFAULT_FLUSH_TIMEOUT_MS = 5_000;

const DENIED_AUDIT_EVENT_LIMIT = 5;

type DenialWindow = {
  startedAt: number;
  denied: number;
  inFlight: number;
  suppressed: number;
  firstSuppressedAt: number | null;
  lastSuppressedAt: number | null;
  summaryQueued: boolean;
  summaryWriter: DeniedAuditSummaryWriter | null;
  cancelSummary: (() => void) | null;
  waiters: DeniedAuditWaiter[];
};

type DeniedAuditWaiter = {
  attemptedAt: number;
  summaryWriter: DeniedAuditSummaryWriter | null;
  resolve: (reservation: DeniedAuditReservation) => void;
};

export type DeniedAuditSummary = {
  suppressedCount: number;
  firstSuppressedAt: number;
  lastSuppressedAt: number;
};

type DeniedAuditSummaryWriter = (
  summary: DeniedAuditSummary,
) => void | Promise<void>;

type DeniedAuditSummaryScheduler = (
  task: () => void,
  delayMs: number,
) => () => void;

type DeniedAuditFlushTimeoutScheduler = (
  task: () => void,
  delayMs: number,
) => () => void;

function scheduleSummary(task: () => void, delayMs: number): () => void {
  const timer = setTimeout(task, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
}

function scheduleFlushTimeout(task: () => void, delayMs: number): () => void {
  const timer = setTimeout(task, delayMs);
  return () => clearTimeout(timer);
}

export type DeniedAuditFlushOptions = {
  timeoutMs?: number;
};

export type DeniedAuditReservation =
  | { admitted: false; reason: 'rate_limited' | 'overloaded' }
  | {
      admitted: true;
      complete: (outcome: 'denied' | 'other') => void;
    };

/**
 * A bounded process-local admission counter for denial-producing commands.
 * Reservations happen before a database transaction begins, so a burst cannot
 * queue an unbounded number of permanent denial writes behind a team's audit
 * lock. A bounded number of excess requests wait outside that lock until an
 * authorization outcome frees capacity; requests beyond that waiter cap are
 * rejected as operational overload, not authorization denials. Successful,
 * unchanged, and domain-failed commands release their slot; only confirmed
 * authorization denials consume the fixed-window allowance or cause waiting
 * attempts to be suppressed.
 */
export class DeniedAuditRateLimiter {
  readonly #entries = new Map<string, DenialWindow>();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxKeys: number;
  readonly #maxWaitersPerKey: number;
  readonly #now: () => number;
  readonly #schedule: DeniedAuditSummaryScheduler;
  readonly #scheduleFlushTimeout: DeniedAuditFlushTimeoutScheduler;
  readonly #onSummaryError: (error: unknown) => void;
  readonly #onFlushTimeout: (pendingWrites: number) => void;
  readonly #summaryWrites = new Set<Promise<void>>();

  constructor(options?: {
    limit?: number;
    windowMs?: number;
    maxKeys?: number;
    maxWaitersPerKey?: number;
    now?: () => number;
    schedule?: DeniedAuditSummaryScheduler;
    scheduleFlushTimeout?: DeniedAuditFlushTimeoutScheduler;
    onSummaryError?: (error: unknown) => void;
    onFlushTimeout?: (pendingWrites: number) => void;
  }) {
    this.#limit = options?.limit ?? DENIED_AUDIT_EVENT_LIMIT;
    this.#windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.#maxKeys = options?.maxKeys ?? DEFAULT_MAX_KEYS;
    this.#maxWaitersPerKey =
      options?.maxWaitersPerKey ?? DEFAULT_MAX_WAITERS_PER_KEY;
    if (
      !Number.isSafeInteger(this.#maxWaitersPerKey) ||
      this.#maxWaitersPerKey < 0
    ) {
      throw new RangeError('maxWaitersPerKey must be a non-negative integer');
    }
    this.#now = options?.now ?? Date.now;
    this.#schedule = options?.schedule ?? scheduleSummary;
    this.#scheduleFlushTimeout =
      options?.scheduleFlushTimeout ?? scheduleFlushTimeout;
    this.#onSummaryError =
      options?.onSummaryError ??
      (() => logOperational('STUDIO_DENIED_AUDIT_SUMMARY_FAILED'));
    this.#onFlushTimeout =
      options?.onFlushTimeout ??
      (() => logOperational('STUDIO_DENIED_AUDIT_FLUSH_TIMEOUT'));
  }

  #trackSummaryWrite(
    writer: DeniedAuditSummaryWriter,
    summary: DeniedAuditSummary,
  ): void {
    let result: void | Promise<void>;
    try {
      result = writer(summary);
    } catch (error) {
      this.#onSummaryError(error);
      return;
    }
    const write = Promise.resolve(result).catch(this.#onSummaryError);
    this.#summaryWrites.add(write);
    void write.finally(() => {
      this.#summaryWrites.delete(write);
    });
  }

  #queueSummary(key: string, window: DenialWindow): void {
    if (
      window.summaryQueued ||
      window.suppressed === 0 ||
      window.firstSuppressedAt === null ||
      window.lastSuppressedAt === null ||
      !window.summaryWriter
    ) {
      return;
    }
    window.summaryQueued = true;
    window.cancelSummary?.();
    window.cancelSummary = null;
    const writer = window.summaryWriter;
    window.summaryWriter = null;
    const summary = {
      suppressedCount: window.suppressed,
      firstSuppressedAt: window.firstSuppressedAt,
      lastSuppressedAt: window.lastSuppressedAt,
    } satisfies DeniedAuditSummary;
    this.#trackSummaryWrite(writer, summary);
    if (
      this.#now() - window.startedAt >= this.#windowMs &&
      this.#entries.get(key) === window
    ) {
      this.#entries.delete(key);
    }
  }

  /** Flushes pending immutable summaries before their process-local timers die. */
  async flush(options: DeniedAuditFlushOptions = {}): Promise<boolean> {
    for (const [key, window] of this.#entries) {
      this.#queueSummary(key, window);
      if (window.summaryQueued && this.#entries.get(key) === window) {
        this.#entries.delete(key);
      }
    }
    const pending = [...this.#summaryWrites];
    if (pending.length === 0) return true;

    const timeoutMs = options.timeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const cancelTimeout = this.#scheduleFlushTimeout(() => {
        if (settled) return;
        settled = true;
        this.#onFlushTimeout(pending.length);
        resolve(false);
      }, timeoutMs);
      void Promise.all(pending).then(() => {
        if (settled) return undefined;
        settled = true;
        cancelTimeout();
        resolve(true);
        return undefined;
      });
    });
  }

  #recordSuppressed(
    key: string,
    window: DenialWindow,
    attemptedAt: number,
    summaryWriter?: DeniedAuditSummaryWriter | null,
  ): void {
    window.suppressed = Math.min(
      Number.MAX_SAFE_INTEGER,
      window.suppressed + 1,
    );
    window.firstSuppressedAt ??= attemptedAt;
    window.lastSuppressedAt = attemptedAt;
    window.summaryWriter ??= summaryWriter ?? null;
    if (window.summaryWriter && !window.cancelSummary) {
      window.cancelSummary = this.#schedule(
        () => this.#queueSummary(key, window),
        Math.max(0, window.startedAt + this.#windowMs - this.#now()),
      );
    }
  }

  #admit(key: string, window: DenialWindow): DeniedAuditReservation {
    window.inFlight++;
    let completed = false;
    return {
      admitted: true,
      complete: (outcome) => {
        if (completed) return;
        completed = true;
        window.inFlight--;
        if (outcome === 'denied') window.denied++;
        this.#drainWaiters(key, window);
        if (
          this.#entries.get(key) === window &&
          window.denied === 0 &&
          window.inFlight === 0 &&
          window.waiters.length === 0 &&
          window.suppressed === 0
        ) {
          this.#entries.delete(key);
        }
      },
    };
  }

  #drainWaiters(key: string, window: DenialWindow): void {
    if (window.denied >= this.#limit) {
      for (const waiter of window.waiters.splice(0)) {
        this.#recordSuppressed(
          key,
          window,
          waiter.attemptedAt,
          waiter.summaryWriter,
        );
        waiter.resolve({ admitted: false, reason: 'rate_limited' });
      }
      return;
    }

    while (
      window.waiters.length > 0 &&
      window.denied + window.inFlight < this.#limit
    ) {
      const waiter = window.waiters.shift()!;
      waiter.resolve(this.#admit(key, window));
    }
  }

  async reserve(
    key: string,
    summaryWriter?: DeniedAuditSummaryWriter,
  ): Promise<DeniedAuditReservation> {
    const now = this.#now();
    let window = this.#entries.get(key);
    if (window && now - window.startedAt >= this.#windowMs) {
      this.#queueSummary(key, window);
      this.#entries.delete(key);
      window = undefined;
    }
    if (!window) {
      if (this.#entries.size >= this.#maxKeys) {
        let oldestIdleKey: string | undefined;
        for (const [candidateKey, candidate] of this.#entries) {
          if (candidate.inFlight === 0) {
            oldestIdleKey = candidateKey;
            break;
          }
        }
        if (!oldestIdleKey) {
          return { admitted: false, reason: 'overloaded' };
        }
        const oldestIdleWindow = this.#entries.get(oldestIdleKey);
        if (oldestIdleWindow) {
          this.#queueSummary(oldestIdleKey, oldestIdleWindow);
        }
        this.#entries.delete(oldestIdleKey);
      }
      window = {
        startedAt: now,
        denied: 0,
        inFlight: 0,
        suppressed: 0,
        firstSuppressedAt: null,
        lastSuppressedAt: null,
        summaryQueued: false,
        summaryWriter: null,
        cancelSummary: null,
        waiters: [],
      };
      this.#entries.set(key, window);
    }
    if (window.denied >= this.#limit) {
      this.#recordSuppressed(key, window, now, summaryWriter);
      return { admitted: false, reason: 'rate_limited' };
    }
    if (window.denied + window.inFlight < this.#limit) {
      return this.#admit(key, window);
    }
    if (window.waiters.length >= this.#maxWaitersPerKey) {
      return { admitted: false, reason: 'overloaded' };
    }

    return new Promise<DeniedAuditReservation>((resolve) => {
      window.waiters.push({
        attemptedAt: now,
        summaryWriter: summaryWriter ?? null,
        resolve,
      });
    });
  }
}

const deniedAuditRateLimiter = new DeniedAuditRateLimiter();

export function reserveDeniedAuditAttempt(
  input: {
    actorId: string;
    teamId: string;
    operation: string;
  },
  summaryWriter?: DeniedAuditSummaryWriter,
): Promise<DeniedAuditReservation> {
  return deniedAuditRateLimiter.reserve(
    JSON.stringify([input.actorId, input.teamId, input.operation]),
    summaryWriter,
  );
}

export function flushDeniedAuditSummaries(
  options?: DeniedAuditFlushOptions,
): Promise<boolean> {
  return deniedAuditRateLimiter.flush(options);
}
