import { Context, Effect, Layer, Predicate, Schema } from 'effect';

import { DENIED_SCOPE_COUNTS_KEY } from '../../../rate-limit/limiter.ts';
import { RateLimitStore } from '../../../rate-limit/store.ts';

const SCAN_COUNT = 500;

/** Renames rather than deletes, so the record survives a run that dies before it writes. */
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

const DRAIN_SCRIPT = `
local reply = redis.call('HGETALL', KEYS[1])
if #reply > 0 then redis.call('DEL', KEYS[1]) end
return reply
`;

export class DeniedAttemptsStoreFailed extends Schema.TaggedError<DeniedAttemptsStoreFailed>()(
  'DeniedAttemptsStoreFailed',
  { operation: Schema.String, message: Schema.String },
) {}

export type WindowClaim = {
  readonly key: string;
  readonly claimKey: string;
  readonly nowMs: number;
  readonly ttlMs: number;
  readonly staleMs: number;
};

export type WindowFields = ReadonlyMap<string, string>;

const NOTHING: WindowFields = new Map<string, string>();

export class DeniedAttemptsStore extends Context.Service<
  DeniedAttemptsStore,
  {
    readonly configured: boolean;
    readonly scanWindowKeys: (
      prefix: string,
    ) => Effect.Effect<readonly string[], DeniedAttemptsStoreFailed>;
    readonly claimWindow: (
      claim: WindowClaim,
    ) => Effect.Effect<WindowFields, DeniedAttemptsStoreFailed>;
    readonly discardClaim: (
      claimKey: string,
    ) => Effect.Effect<void, DeniedAttemptsStoreFailed>;
    readonly drainScopeCounts: Effect.Effect<
      WindowFields,
      DeniedAttemptsStoreFailed
    >;
  }
>()('@studio/jobs/handlers/DeniedAttemptsStore') {
  static readonly layer: Layer.Layer<
    DeniedAttemptsStore,
    never,
    RateLimitStore
  > = Layer.effect(
    DeniedAttemptsStore,
    Effect.map(Effect.service(RateLimitStore), (store) => live(store)),
  );
}

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
    return readHash(reply) ?? NOTHING;
  });

  const discardClaim = Effect.fn('DeniedAttemptsStore.discardClaim')(function* (
    claimKey: string,
  ) {
    yield* store.run((redis) => redis.del(claimKey));
  });

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
