const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_KEYS = 10_000;

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

function scheduleSummary(task: () => void, delayMs: number): () => void {
  const timer = setTimeout(task, delayMs);
  timer.unref();
  return () => clearTimeout(timer);
}

export type DeniedAuditReservation =
  | { admitted: false }
  | {
      admitted: true;
      complete: (outcome: 'denied' | 'other') => void;
    };

/**
 * A bounded process-local admission counter for denial-producing commands.
 * Reservations happen before a database transaction begins, so a burst cannot
 * queue an unbounded number of permanent denial writes behind a team's audit
 * lock. Successful, unchanged, and domain-failed commands release their slot;
 * only confirmed authorization denials consume the fixed-window allowance.
 */
export class DeniedAuditRateLimiter {
  readonly #entries = new Map<string, DenialWindow>();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxKeys: number;
  readonly #now: () => number;
  readonly #schedule: DeniedAuditSummaryScheduler;
  readonly #onSummaryError: (error: unknown) => void;

  constructor(options?: {
    limit?: number;
    windowMs?: number;
    maxKeys?: number;
    now?: () => number;
    schedule?: DeniedAuditSummaryScheduler;
    onSummaryError?: (error: unknown) => void;
  }) {
    this.#limit = options?.limit ?? DENIED_AUDIT_EVENT_LIMIT;
    this.#windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.#maxKeys = options?.maxKeys ?? DEFAULT_MAX_KEYS;
    this.#now = options?.now ?? Date.now;
    this.#schedule = options?.schedule ?? scheduleSummary;
    this.#onSummaryError =
      options?.onSummaryError ??
      ((error) => {
        process.emitWarning(
          error instanceof Error ? error.message : 'Unknown summary failure',
          {
            type: 'StudioAuditWarning',
            code: 'STUDIO_DENIED_AUDIT_SUMMARY_FAILED',
          },
        );
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
    try {
      Promise.resolve(writer(summary)).catch(this.#onSummaryError);
    } catch (error) {
      this.#onSummaryError(error);
    }
    if (
      this.#now() - window.startedAt >= this.#windowMs &&
      this.#entries.get(key) === window
    ) {
      this.#entries.delete(key);
    }
  }

  reserve(
    key: string,
    summaryWriter?: DeniedAuditSummaryWriter,
  ): DeniedAuditReservation {
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
        if (!oldestIdleKey) return { admitted: false };
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
      };
      this.#entries.set(key, window);
    }
    if (window.denied + window.inFlight >= this.#limit) {
      window.suppressed = Math.min(
        Number.MAX_SAFE_INTEGER,
        window.suppressed + 1,
      );
      window.firstSuppressedAt ??= now;
      window.lastSuppressedAt = now;
      window.summaryWriter ??= summaryWriter ?? null;
      if (window.summaryWriter && !window.cancelSummary) {
        window.cancelSummary = this.#schedule(
          () => this.#queueSummary(key, window),
          Math.max(0, window.startedAt + this.#windowMs - now),
        );
      }
      return { admitted: false };
    }

    window.inFlight++;
    let completed = false;
    return {
      admitted: true,
      complete: (outcome) => {
        if (completed) return;
        completed = true;
        window.inFlight--;
        if (outcome === 'denied') window.denied++;
        if (
          this.#entries.get(key) === window &&
          window.denied === 0 &&
          window.inFlight === 0 &&
          window.suppressed === 0
        ) {
          this.#entries.delete(key);
        }
      },
    };
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
): DeniedAuditReservation {
  return deniedAuditRateLimiter.reserve(
    JSON.stringify([input.actorId, input.teamId, input.operation]),
    summaryWriter,
  );
}
