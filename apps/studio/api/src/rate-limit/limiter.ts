import { createHash, randomUUID } from 'node:crypto';

import { Clock, Context, Effect, Layer, Ref } from 'effect';

import {
  RATE_LIMITS,
  type RateLimitRule,
  type RateLimitScope,
  type RateLimitSettings,
} from './scopes.ts';
import { RateLimitStore, UNAVAILABLE } from './store.ts';

// Studio's one rate limiter (#1909). Every limited surface asks this module,
// it asks Valkey, and the answer is the same whether one API container is
// running or two — which is the whole reason it exists: the limiters it
// replaces kept their counters in Postgres rows keyed by address and in
// process memory, and the second of those stopped meaning anything the moment
// a request could land on either of two processes.
//
// **A sliding window over a sorted set**, decided by one Lua script. The three
// candidates were a fixed window, two overlapping fixed windows, and this. A
// fixed window lets twice the limit through across a boundary, which for
// `5/10m` on one email address is the difference between five attempts and
// ten. The two-window approximation fixes that by estimating, and an estimate
// is a bad thing to explain to a researcher who was refused. The sorted set
// stores one member per admitted call — tens of members, since that is what a
// limit of tens means — so the exactness costs a few hundred bytes per active
// subject, and the retry-after it returns is the truth (when the oldest call
// in the window leaves it) rather than the whole window length.
//
// Atomicity is the script: read, expire, count, and admit happen inside one
// Redis execution, so two concurrent requests cannot both see a count below
// the limit. The clock is Valkey's own `TIME`, not the calling process's, so
// two API containers with drifting clocks still share one window.

/**
 * Keys are `studio:rl:<scope>:<subject>`, where the subject has been hashed
 * before it becomes key material. A client address and an email address are
 * both personal data, and a limiter's key space is the one place they would
 * otherwise sit in clear in a store that is backed up by nobody, secured by a
 * network boundary, and readable by anything with the connection string.
 */
const KEY_PREFIX = 'studio:rl';

/**
 * Where denied calls are counted for the per-minute summary job. A field per
 * scope and a count, and nothing that could identify who was denied — the
 * summary says "twelve sign-ins were refused", which is what an operator needs
 * and the most that can be said without putting subjects in the log.
 */
export const DENIED_SCOPE_COUNTS_KEY = `${KEY_PREFIX}:denied-scopes`;

/** Long enough that a worker outage does not lose the counts, short enough to bound them. */
const DENIED_SCOPE_COUNTS_TTL_MS = 3_600_000;

/** One line per scope per minute: a burst is one attack, not a thousand log lines. */
const DENIAL_LOG_INTERVAL_MS = 60_000;

/**
 * Sent whole on every decision rather than registered with `defineCommand`,
 * which would add EVALSHA plus NOSCRIPT recovery for a few hundred bytes on a
 * loopback or private-network hop. If a profile ever says otherwise this is
 * the one place to change.
 */
const CONSUME_SCRIPT = `
local key = KEYS[1]
local denied = KEYS[2]
local max = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local member = ARGV[3]
local scope = ARGV[4]
local deniedTtlMs = tonumber(ARGV[5])
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - windowMs)
if redis.call('ZCARD', key) >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryMs = windowMs
  if oldest[2] then retryMs = tonumber(oldest[2]) + windowMs - now end
  if retryMs < 1 then retryMs = 1 end
  redis.call('PEXPIRE', key, windowMs)
  redis.call('HINCRBY', denied, scope, 1)
  redis.call('PEXPIRE', denied, deniedTtlMs)
  return {0, retryMs}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
return {1, 0}
`;

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/** The subject never leaves this function unhashed. 128 bits is past collision. */
function hashSubject(subject: string): string {
  return createHash('sha256').update(subject).digest('hex').slice(0, 32);
}

/**
 * Unique per admitted call, so two calls in the same millisecond are two
 * members of the sorted set rather than one overwriting the other. The random
 * prefix is drawn once per process; the counter does the rest.
 */
const MEMBER_PREFIX = randomUUID();
let memberCounter = 0;

/** `[allowed, retryMs]`, as the script returns it; anything else is a bug worth failing open on. */
function readDecision(reply: unknown): RateLimitDecision | null {
  if (!Array.isArray(reply) || reply.length !== 2) return null;
  const [allowed, retryMs] = reply;
  if (typeof allowed !== 'number' || typeof retryMs !== 'number') return null;
  if (allowed === 1) return { allowed: true };
  return {
    allowed: false,
    // Ceiling, and never zero: a `Retry-After: 0` invites an immediate retry
    // that is refused again.
    retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
  };
}

const make = Effect.fnUntraced(function* (settings: RateLimitSettings) {
  const store = yield* RateLimitStore;
  // Per limiter rather than per module, so two limiters in one process —
  // which only the suites build — log independently.
  const lastDenialLogAt = yield* Ref.make<ReadonlyMap<string, number>>(
    new Map(),
  );

  /**
   * The scope and the retry-after, and deliberately nothing else. What was
   * denied is operationally useful; who was denied is a participant's address
   * or a researcher's email, and a rate-limit log is not a place to keep
   * either.
   */
  const logDenial = Effect.fnUntraced(function* (
    scope: string,
    retryAfterSeconds: number,
  ) {
    const now = yield* Clock.currentTimeMillis;
    const due = yield* Ref.modify(lastDenialLogAt, (logged) => {
      const last = logged.get(scope) ?? Number.NEGATIVE_INFINITY;
      if (now - last < DENIAL_LOG_INTERVAL_MS) return [false, logged];
      return [true, new Map(logged).set(scope, now)];
    });
    if (!due) return;
    yield* Effect.logWarning(
      `Rate limit reached for ${scope}; callers are refused for up to ${retryAfterSeconds}s.`,
    );
  });

  const consume = Effect.fnUntraced(function* (
    scope: string,
    subject: string,
    rule: RateLimitRule,
  ): Effect.fn.Return<RateLimitDecision> {
    if (!store.configured) return { allowed: true };
    const reply = yield* store.run((redis) =>
      redis.eval(
        CONSUME_SCRIPT,
        2,
        `${KEY_PREFIX}:${scope}:${hashSubject(subject)}`,
        DENIED_SCOPE_COUNTS_KEY,
        String(rule.max),
        String(rule.windowMs),
        `${MEMBER_PREFIX}:${(memberCounter += 1)}`,
        scope,
        String(DENIED_SCOPE_COUNTS_TTL_MS),
      ),
    );
    // Both the unreachable store and a reply this module cannot read fail
    // open: the limit is a defence, and refusing every request because the
    // defence is broken turns an abuse control into an outage.
    if (reply === UNAVAILABLE) return { allowed: true };
    const decision = readDecision(reply);
    if (!decision) return { allowed: true };
    if (!decision.allowed) yield* logDenial(scope, decision.retryAfterSeconds);
    return decision;
  });

  return RateLimiter.of({
    configured: store.configured,
    rules: settings,
    check: (scope, subject) => consume(scope, subject, settings[scope]),
    consume,
    readiness: store.configured
      ? Effect.map(store.ping, (reply) => (reply === 'ok' ? 'ok' : 'degraded'))
      : Effect.succeed('ok'),
  });
});

export class RateLimiter extends Context.Service<
  RateLimiter,
  {
    /** Whether there is a store at all; readiness omits its check when there is not. */
    readonly configured: boolean;
    /**
     * What each scope allows, for the one caller that has to state a limit
     * rather than ask for a decision: better-auth resolves the window and
     * maximum per path itself and needs Studio's numbers as configuration.
     */
    readonly rules: RateLimitSettings;
    /** One call against a catalogued scope's own limit. */
    readonly check: (
      scope: RateLimitScope,
      subject: string,
    ) => Effect.Effect<RateLimitDecision>;
    /**
     * One call against a limit this module did not choose — better-auth's own
     * limiter, which resolves the window and maximum per path and hands them
     * to whatever storage it was given (src/auth/better-auth.ts).
     */
    readonly consume: (
      scope: string,
      subject: string,
      rule: RateLimitRule,
    ) => Effect.Effect<RateLimitDecision>;
    /** `degraded`, never `failed`: the limiter fails open, so losing it does not unfit the process. */
    readonly readiness: Effect.Effect<'ok' | 'degraded'>;
  }
>()('@studio/RateLimiter') {
  /**
   * The limiter with some scopes enforcing something other than their
   * constant. A deployment never takes it — the limits are the constants in
   * `rate-limit/scopes.ts`, nothing in the environment can reach this, and the
   * programs take `layer` — and the suites do, because tripping a real limit
   * through the request path would otherwise mean two thousand requests to
   * `/storage`.
   */
  static readonly layerWith = (
    limits: Partial<RateLimitSettings>,
  ): Layer.Layer<RateLimiter, never, RateLimitStore> =>
    Layer.effect(RateLimiter, make({ ...RATE_LIMITS, ...limits }));

  /** Every scope at its constant, which is what every deployment runs. */
  static readonly layer: Layer.Layer<RateLimiter, never, RateLimitStore> =
    RateLimiter.layerWith({});
}
