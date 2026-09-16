import { Context, Effect, Layer, Predicate, Schema } from 'effect';

import { DENIED_SCOPE_COUNTS_KEY } from '../../../rate-limit.ts';
import type { RateLimitStore } from '../../../rate-limit/store.ts';
import { deepestMessage } from '../../errors.ts';

// The half of `denied-attempts-summary` that talks to Valkey, behind a tag
// (#1927 stage 4). `RateLimitStore` (src/rate-limit/store.ts) is an ioredis
// client wrapped in a Promise surface that never rejects — an unreachable
// store, a timed-out command and a Lua error all arrive as its `UNAVAILABLE`
// marker — and stage 4 is what turns that module itself into an Effect
// service. Until then this tag is the seam: the live layer wraps today's
// store, and the handler above it never sees a Promise.
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
// run takes what this one did not. The error channel is for a rejection the
// store's own contract says cannot happen; it fails the job if it ever does.

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
 * The store rejected, which its own surface says it does not do: every
 * failure it knows about is reported as `UNAVAILABLE` instead. Typed rather
 * than a defect so the job fails and is seen, the way today's handler's outer
 * `catch` makes the run fail.
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
     * to summarise and says so; stage 3 provides `layerAbsent` when
     * `REDIS_URL` is unset, which is the same posture today's optional
     * `deps.store` takes.
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
  /** Today's ioredis-backed store, which stage 4 replaces with its own service. */
  static readonly layer = (
    store: RateLimitStore,
  ): Layer.Layer<DeniedAttemptsStore> =>
    Layer.succeed(DeniedAttemptsStore)(live(store));

  /** No store is configured; there is nothing to summarise. */
  static readonly layerAbsent: Layer.Layer<DeniedAttemptsStore> = Layer.succeed(
    DeniedAttemptsStore,
  )(
    DeniedAttemptsStore.of({
      configured: false,
      scanWindowKeys: () => Effect.succeed([]),
      claimWindow: () => Effect.succeed(NOTHING),
      discardClaim: () => Effect.void,
      drainScopeCounts: Effect.succeed(NOTHING),
    }),
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

const live = (store: RateLimitStore): DeniedAttemptsStore['Service'] => {
  /**
   * One operation. `store.run` answers with its `UNAVAILABLE` marker rather
   * than rejecting, so a failure here is that contract being broken, not the
   * store being down.
   */
  const run = <A>(operation: string, work: () => Promise<A>) =>
    Effect.tryPromise({
      try: work,
      catch: (cause) =>
        new DeniedAttemptsStoreFailed({
          operation,
          message: deepestMessage(cause) ?? String(cause),
        }),
    });

  const scanWindowKeys = Effect.fn('DeniedAttemptsStore.scanWindowKeys')(
    function* (prefix: string) {
      const found: string[] = [];
      let cursor = '0';
      do {
        const page = yield* run('scan', () =>
          store.run((redis) =>
            redis.scan(cursor, 'MATCH', `${prefix}:*`, 'COUNT', SCAN_COUNT),
          ),
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
    const reply = yield* run('claim', () =>
      store.run((redis) =>
        redis.eval(
          CLAIM_SCRIPT,
          2,
          claim.key,
          claim.claimKey,
          String(claim.ttlMs),
          String(claim.nowMs),
          String(claim.staleMs),
        ),
      ),
    );
    // A reply of another shape — the store's `UNAVAILABLE` marker included —
    // is nothing claimed, which is what leaves the window for the next run.
    return readHash(reply) ?? NOTHING;
  });

  const discardClaim = Effect.fn('DeniedAttemptsStore.discardClaim')(function* (
    claimKey: string,
  ) {
    yield* run('del', () => store.run((redis) => redis.del(claimKey)));
  });

  // A span like its three siblings have: this is the fourth destructive
  // operation on the store, and a trace that shows the claim and the discard
  // but not the drain hides the one that empties the scope counts.
  const drainScopeCounts = Effect.gen(function* () {
    const reply = yield* run('drain', () =>
      store.run((redis) =>
        redis.eval(DRAIN_SCRIPT, 1, DENIED_SCOPE_COUNTS_KEY),
      ),
    );
    return readHash(reply) ?? NOTHING;
  }).pipe(Effect.withSpan('DeniedAttemptsStore.drainScopeCounts'));

  return DeniedAttemptsStore.of({
    configured: true,
    scanWindowKeys,
    claimWindow,
    discardClaim,
    drainScopeCounts,
  });
};
