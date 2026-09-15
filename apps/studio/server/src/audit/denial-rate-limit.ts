import { readEnv } from '../env.ts';
import { getRateLimitStore, type RateLimitStore } from '../rate-limit/store.ts';

// How many denial events one actor may write into one team's audit log for one
// operation before the rest of the burst is summarised instead.
//
// **Why there is a limiter at all.** An authorization denial is a required,
// immutable audit event, appended under the team's audit lock. A caller who
// can produce denials on demand can therefore make an unbounded number of
// permanent rows queue behind that lock. The window caps what one (actor,
// team, operation) can write in a minute; everything past the cap is counted
// and becomes a single `security.denied_attempts.rate_limited` event naming
// how many attempts there were and when the first and last of them happened.
//
// **Why it is in Valkey (#1909).** The counters and the suppression record
// used to live in a `Map` in the web process, and the summaries were written
// at shutdown. Both stopped being true the moment a request could land on
// either of two API containers: the cap became a cap per container, and a
// container killed rather than stopped lost its summaries. The state is now
// one hash per (actor, team, operation, window) in the shared store, expiring
// shortly after its window, and the summaries are written by a worker job
// every minute (src/jobs/handlers/denied-attempts-summary.ts).
//
// **Why there are no waiters.** The version this replaces queued excess
// concurrent attempts outside the audit lock and admitted them as capacity
// freed, with a second bound on the queue itself. A queue is process-local by
// construction, so it could not move to a shared store, and it was bounding
// the wrong thing anyway: what protects the lock is that only a fixed number
// of denials per minute may be written at all, which the window count enforces
// on its own. Concurrency past that count is bounded by the same count one
// window later, and nothing waits.
//
// **What is failing open.** A store that cannot be reached admits. The
// alternative — refusing — would turn a Valkey outage into a team's commands
// failing, and the events this bounds are ones the caller was going to be
// refused anyway.

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 60_000;

/**
 * How long a window's hash outlives the window itself. The summary job runs
 * every minute, so five gives it several chances at a suppressed window before
 * the key expires — and bounds what an outage of the worker can accumulate.
 */
const DEFAULT_GRACE_MS = 300_000;

export const DENIAL_KEY_PREFIX = 'studio:audit-denial';

export type DeniedAuditReservation =
  | { admitted: false; reason: 'rate_limited' }
  | {
      admitted: true;
      /**
       * Awaited rather than fired and forgotten: a confirmed denial has to be
       * counted before the next request is answered, or a caller issuing
       * denials one after another would never reach the cap.
       */
      complete: (outcome: 'denied' | 'other') => Promise<void>;
    };

/** What one suppressed window has to say; the job turns it into an event. */
export type DeniedAuditSummary = {
  suppressedCount: number;
  firstSuppressedAt: number;
  lastSuppressedAt: number;
};

/** Which (actor, team, operation, window) a suppression record belongs to. */
export type DeniedAuditWindow = {
  teamId: string;
  actorId: string;
  operation: string;
  /** Start of the fixed window, in epoch milliseconds. */
  windowStart: number;
};

/**
 * Component-encoded so that no identifier can inject a separator, and so the
 * job can read the three identifiers back out of a key it found by scanning.
 * They are internal identifiers and an operation name — the audit log already
 * records all three — so unlike the limiter's subjects they are not hashed:
 * the summary has to be written into the right team's log by the right actor.
 */
function windowKey(prefix: string, window: DeniedAuditWindow): string {
  return [
    prefix,
    encodeURIComponent(window.teamId),
    encodeURIComponent(window.actorId),
    encodeURIComponent(window.operation),
    String(window.windowStart),
  ].join(':');
}

/** The inverse, for the summary job. Null for a key this build did not write. */
export function parseDenialWindowKey(
  key: string,
  prefix: string = DENIAL_KEY_PREFIX,
): DeniedAuditWindow | null {
  if (!key.startsWith(`${prefix}:`)) return null;
  const parts = key.slice(prefix.length + 1).split(':');
  if (parts.length !== 4) return null;
  const [teamId, actorId, operation, windowStart] = parts as [
    string,
    string,
    string,
    string,
  ];
  const start = Number(windowStart);
  if (!Number.isSafeInteger(start)) return null;
  try {
    return {
      teamId: decodeURIComponent(teamId),
      actorId: decodeURIComponent(actorId),
      operation: decodeURIComponent(operation),
      windowStart: start,
    };
  } catch {
    return null;
  }
}

/**
 * One reservation, decided inside Valkey so that two API containers asking at
 * once cannot both see a count below the cap. Returns 1 for admitted, 0 for
 * suppressed; a suppressed attempt is recorded on the same round trip.
 */
const RESERVE_SCRIPT = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttlMs = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
if tonumber(redis.call('HGET', key, 'denied') or '0') >= limit then
  redis.call('HINCRBY', key, 'suppressed', 1)
  redis.call('HSETNX', key, 'first', now)
  redis.call('HSET', key, 'last', now)
  redis.call('PEXPIRE', key, ttlMs)
  return 0
end
return 1
`;

/** A confirmed denial spends one of the window's allowance. */
const RECORD_DENIAL_SCRIPT = `
redis.call('HINCRBY', KEYS[1], 'denied', 1)
redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
return 1
`;

export type DeniedAuditRateLimiterOptions = {
  /** Absent means no store: every attempt is admitted, as when one is unreachable. */
  store?: RateLimitStore | undefined;
  limit?: number;
  windowMs?: number;
  graceMs?: number;
  /** The suites give each file its own, so parallel runs share one Valkey safely. */
  keyPrefix?: string;
  now?: () => number;
};

/**
 * A fixed window per (actor, team, operation), aligned to the clock rather
 * than started by the first denial. Alignment is what puts the window boundary
 * in the key, which is what lets a new window start without touching the
 * previous one's suppression record — so nothing has to roll a window over,
 * and the summary job never races a live request for the same hash.
 *
 * The window is chosen from the calling process's clock, not Valkey's, because
 * the key has to be known before the round trip. Two API containers whose
 * clocks differ by less than the window still agree on it almost always, and
 * when they do not the cost is one extra summary event, not a lost one.
 */
export class DeniedAuditRateLimiter {
  readonly #store: RateLimitStore | undefined;
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #ttlMs: number;
  readonly #keyPrefix: string;
  readonly #now: () => number;

  constructor(options: DeniedAuditRateLimiterOptions = {}) {
    this.#store = options.store;
    this.#limit = options.limit ?? DEFAULT_LIMIT;
    this.#windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.#ttlMs = this.#windowMs + (options.graceMs ?? DEFAULT_GRACE_MS);
    this.#keyPrefix = options.keyPrefix ?? DENIAL_KEY_PREFIX;
    this.#now = options.now ?? Date.now;
  }

  /** The key a reservation made now would use; the suites read it back. */
  keyFor(input: {
    teamId: string;
    actorId: string;
    operation: string;
  }): string {
    const now = this.#now();
    return windowKey(this.#keyPrefix, {
      ...input,
      windowStart: Math.floor(now / this.#windowMs) * this.#windowMs,
    });
  }

  async reserve(input: {
    teamId: string;
    actorId: string;
    operation: string;
  }): Promise<DeniedAuditReservation> {
    const store = this.#store;
    const key = this.keyFor(input);
    // No store at all is the same posture as a store that cannot be reached.
    if (!store) return { admitted: true, complete: async () => undefined };

    const reply = await store.run((redis) =>
      redis.eval(
        RESERVE_SCRIPT,
        1,
        key,
        String(this.#limit),
        String(this.#ttlMs),
        String(this.#now()),
      ),
    );
    // Only a literal 0 suppresses. An unreachable store yields the store's own
    // `unavailable` marker instead, and that — like anything else this cannot
    // read — admits, which is the direction a broken defence must fail in.
    if (reply === 0) return { admitted: false, reason: 'rate_limited' };

    let completed = false;
    return {
      admitted: true,
      complete: async (outcome) => {
        // Idempotent, because the call sites complete in both a try and a
        // catch and a future edit must not be able to spend two allowances.
        if (completed || outcome !== 'denied') {
          completed = true;
          return;
        }
        completed = true;
        await store.run((redis) =>
          redis.eval(RECORD_DENIAL_SCRIPT, 1, key, String(this.#ttlMs)),
        );
      },
    };
  }
}

/**
 * The process's limiter, built on first use rather than at import: the store's
 * URL comes from the environment, and this module is imported by command
 * modules that are themselves imported before any environment is read.
 */
let processLimiter: DeniedAuditRateLimiter | undefined;

function limiter(): DeniedAuditRateLimiter {
  if (processLimiter) return processLimiter;
  const { redis } = readEnv();
  processLimiter = new DeniedAuditRateLimiter({
    store: redis ? getRateLimitStore(redis) : undefined,
  });
  return processLimiter;
}

export function reserveDeniedAuditAttempt(input: {
  actorId: string;
  teamId: string;
  operation: string;
}): Promise<DeniedAuditReservation> {
  return limiter().reserve(input);
}
