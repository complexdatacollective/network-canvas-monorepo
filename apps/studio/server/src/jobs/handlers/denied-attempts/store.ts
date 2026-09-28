import { Context, Effect, Layer, Predicate, Schema } from 'effect';

import { DENIED_SCOPE_COUNTS_KEY } from '../../../rate-limit/limiter.ts';
import { RateLimitStore } from '../../../rate-limit/store.ts';

// The half of `denied-attempts-summary` that talks to Valkey, behind a tag
// (#1927 stage 4). The live layer is over `RateLimitStore`
// (src/rate-limit/store.ts), the Effect service every other Valkey caller
// uses: an unreachable store, a timed-out command and a Lua error all arrive
// as its `UNAVAILABLE` marker rather than as a failure, and the handler above
// this never sees a Promise.
//
// The surface is what the job means rather than what Redis does: "every
// suppression key", "take this window", "give up this claim", "drain the
// scope counts". The Lua that makes the first two atomic lives in the live
// layer, which is what lets a test layer honour the same semantics over a
// `Map` instead of interpreting Lua. The policy — how long a claim lives and
// when another run may take it back — stays in the handler and rides in on
// every call, because it is the job's rule, not the store's.
//
// Unavailability keeps the shape today's handler gives it: it is a value, not
// a failure. A scan that cannot finish answers with what it got, a claim that
// cannot be taken answers with nothing, and the run does less this minute
// rather than failing — the keys outlive their window by minutes, so the next
// run takes what this one did not. The error channel is the job's vocabulary
// for a store that refused an operation outright; the live layer never uses
// it, because `RateLimitStore.run` cannot fail, and the memory layer
// (`testing.ts`) uses it to reach the handler's failure paths.

/** `SCAN` is cursor-based; this is how much of the keyspace one call covers. */
const SCAN_COUNT = 500;

/**
 * Takes a closed window by renaming it, so the run that got the contents is
 * the only one that can write its summary, and so the record survives a run
 * that dies before it writes.
 *
 * Deleting instead — which is what this did first — loses the summary
 * outright if the audit write then fails, with nothing left to retry from. A
 * claimed key is picked up by a later run instead, and the write is made
 * idempotent (`summaryAlreadyWritten` in the handler) so the retry cannot
 * produce a second event.
 *
 * `RENAME` over an existing claim is harmless: the only way one exists is a
 * previous run of this same window, whose contents are identical.
 */
const CLAIM_SCRIPT = `
local key = KEYS[1]
local claim = KEYS[2]
local ttlMs = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local staleMs = tonumber(ARGV[3])
if redis.call('EXISTS', key) == 1 then
  redis.call('RENAME', key, claim)
  redis.call('HSET', claim, 'claimedAt', now)
  redis.call('PEXPIRE', claim, ttlMs)
  return redis.call('HGETALL', claim)
end
if redis.call('EXISTS', claim) == 0 then return {} end
if now - tonumber(redis.call('HGET', claim, 'claimedAt') or '0') < staleMs then
  return {}
end
redis.call('HSET', claim, 'claimedAt', now)
redis.call('PEXPIRE', claim, ttlMs)
return redis.call('HGETALL', claim)
`;

/** Reads the per-scope denial counts and clears them in one execution. */
const DRAIN_SCRIPT = `
local reply = redis.call('HGETALL', KEYS[1])
if #reply > 0 then redis.call('DEL', KEYS[1]) end
return reply
`;

/**
 * The store refused an operation outright. Typed rather than a defect so the
 * job fails and is seen. `RateLimitStore` reports every failure it knows about
 * as `UNAVAILABLE` instead, so only a store other than the live one raises it.
 */
export class DeniedAttemptsStoreFailed extends Schema.TaggedError<DeniedAttemptsStoreFailed>()(
  'DeniedAttemptsStoreFailed',
  { operation: Schema.String, message: Schema.String },
) {}

/** What the handler asks for when it takes a window. */
export type WindowClaim = {
  /** The live window's key; renamed onto `claimKey` when it still exists. */
  readonly key: string;
  readonly claimKey: string;
  /** This run's clock, in epoch milliseconds. */
  readonly nowMs: number;
  /** How long the claim lives if nothing comes back for it. */
  readonly ttlMs: number;
  /** How long a claim is another run's before this one may take it back. */
  readonly staleMs: number;
};

/** A window's hash, as `HGETALL` returns it; empty means nothing was taken. */
export type WindowFields = ReadonlyMap<string, string>;

const NOTHING: WindowFields = new Map<string, string>();

export class DeniedAttemptsStore extends Context.Service<
  DeniedAttemptsStore,
  {
    /**
     * False when the deployment has no store at all. The job then has nothing
     * to summarise and says so. Read from `RateLimitStore`, which is
     * `layerAbsent` when `REDIS_URL` is unset.
     */
    readonly configured: boolean;
    /** Every suppression key under `prefix`, read a page at a time. */
    readonly scanWindowKeys: (
      prefix: string,
    ) => Effect.Effect<readonly string[], DeniedAttemptsStoreFailed>;
    readonly claimWindow: (
      claim: WindowClaim,
    ) => Effect.Effect<WindowFields, DeniedAttemptsStoreFailed>;
    /** Gives up a claim once its summary is in the log, or never will be. */
    readonly discardClaim: (
      claimKey: string,
    ) => Effect.Effect<void, DeniedAttemptsStoreFailed>;
    /** Reads the per-scope denial counts and clears them in one execution. */
    readonly drainScopeCounts: Effect.Effect<
      WindowFields,
      DeniedAttemptsStoreFailed
    >;
  }
>()('@studio/jobs/handlers/DeniedAttemptsStore') {
  /** Over the process's rate-limit store, whichever that is. */
  static readonly layer: Layer.Layer<
    DeniedAttemptsStore,
    never,
    RateLimitStore
  > = Layer.effect(
    DeniedAttemptsStore,
    Effect.map(Effect.service(RateLimitStore), (store) => live(store)),
  );
}

/** `HGETALL`'s flat reply, as Lua returns it. Null for a reply of another shape. */
function readHash(reply: unknown): Map<string, string> | null {
  if (!Array.isArray(reply)) return null;
  const fields = new Map<string, string>();
  for (let index = 0; index + 1 < reply.length; index += 2) {
    const field = reply[index];
    const value = reply[index + 1];
    if (!Predicate.isString(field) || !Predicate.isString(value)) return null;
    fields.set(field, value);
  }
  return fields;
}

const live = (
  store: RateLimitStore['Service'],
): DeniedAttemptsStore['Service'] => {
  const scanWindowKeys = Effect.fn('DeniedAttemptsStore.scanWindowKeys')(
    function* (prefix: string) {
      const found: string[] = [];
      let cursor = '0';
      do {
        const page = yield* store.run((redis) =>
          redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', SCAN_COUNT),
        );
        // An unreachable store mid-scan ends the pass; the keys outlive their
        // window by minutes, so the next run takes what this one did not.
        if (!Array.isArray(page) || page.length !== 2) break;
        const [next, keys] = page;
        if (!Predicate.isString(next) || !Array.isArray(keys)) break;
        for (const key of keys) if (Predicate.isString(key)) found.push(key);
        cursor = next;
      } while (cursor !== '0');
      return found;
    },
  );

  const claimWindow = Effect.fn('DeniedAttemptsStore.claimWindow')(function* (
    claim: WindowClaim,
  ) {
    const reply = yield* store.run((redis) =>
      redis.eval(
        CLAIM_SCRIPT,
        2,
        claim.key,
        claim.claimKey,
        String(claim.ttlMs),
        String(claim.nowMs),
        String(claim.staleMs),
      ),
    );
    // A reply of another shape — the store's `UNAVAILABLE` marker included —
    // is nothing claimed, which is what leaves the window for the next run.
    return readHash(reply) ?? NOTHING;
  });

  const discardClaim = Effect.fn('DeniedAttemptsStore.discardClaim')(function* (
    claimKey: string,
  ) {
    yield* store.run((redis) => redis.del(claimKey));
  });

  // A span like its three siblings have: this is the fourth destructive
  // operation on the store, and a trace that shows the claim and the discard
  // but not the drain hides the one that empties the scope counts.
  const drainScopeCounts = Effect.gen(function* () {
    const reply = yield* store.run((redis) =>
      redis.eval(DRAIN_SCRIPT, 1, DENIED_SCOPE_COUNTS_KEY),
    );
    return readHash(reply) ?? NOTHING;
  }).pipe(Effect.withSpan('DeniedAttemptsStore.drainScopeCounts'));

  return DeniedAttemptsStore.of({
    configured: store.configured,
    scanWindowKeys,
    claimWindow,
    discardClaim,
    drainScopeCounts,
  });
};
