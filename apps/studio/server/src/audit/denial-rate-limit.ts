const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_KEYS = 10_000;

const DENIED_AUDIT_EVENT_LIMIT = 5;

type DenialWindow = {
  startedAt: number;
  denied: number;
  inFlight: number;
};

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

  constructor(options?: {
    limit?: number;
    windowMs?: number;
    maxKeys?: number;
    now?: () => number;
  }) {
    this.#limit = options?.limit ?? DENIED_AUDIT_EVENT_LIMIT;
    this.#windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
    this.#maxKeys = options?.maxKeys ?? DEFAULT_MAX_KEYS;
    this.#now = options?.now ?? Date.now;
  }

  reserve(key: string): DeniedAuditReservation {
    const now = this.#now();
    let window = this.#entries.get(key);
    if (window && now - window.startedAt >= this.#windowMs) {
      this.#entries.delete(key);
      window = undefined;
    }
    if (!window) {
      if (this.#entries.size >= this.#maxKeys) {
        const oldestKey = this.#entries.keys().next().value;
        if (typeof oldestKey === 'string') this.#entries.delete(oldestKey);
      }
      window = { startedAt: now, denied: 0, inFlight: 0 };
      this.#entries.set(key, window);
    }
    if (window.denied + window.inFlight >= this.#limit) {
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
        if (window.denied === 0 && window.inFlight === 0) {
          this.#entries.delete(key);
        }
      },
    };
  }
}

const deniedAuditRateLimiter = new DeniedAuditRateLimiter();

export function reserveDeniedAuditAttempt(input: {
  actorId: string;
  teamId: string;
  operation: string;
}): DeniedAuditReservation {
  return deniedAuditRateLimiter.reserve(
    JSON.stringify([input.actorId, input.teamId, input.operation]),
  );
}
