import { Context, Effect, Exit, Layer, Scope } from 'effect';

import { DeniedAttempts } from '../../audit/denial-rate-limit.ts';
import { Environment, readEnv } from '../../env.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import type { RateLimitSettings } from '../../rate-limit/scopes.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import { CI } from './env.ts';

function unavailable<T>(reason: string, fallback: T): T {
  if (CI) throw new Error(`the Studio limiter suites cannot run: ${reason}`);
  return fallback;
}

export const REDIS_DATABASES = {
  limiter: 1,
  auditDenial: 2,
  routes: 3,
  processes: 4,
  summaryJob: 5,
  health: 6,
  workerEntrypoint: 7,
  webEntrypoint: 8,
  rpcPlane: 9,
  authPlane: 10,
  authService: 11,
  protocolBuilder: 12,
} as const;

function scratchRedisUrl(database: number): string | null {
  const { redis } = readEnv();
  if (!redis) return null;
  const url = new URL(redis);
  url.pathname = `/${database}`;
  return url.toString();
}

const onStore = <A>(
  url: string,
  work: (store: RateLimitStore['Service']) => Effect.Effect<A>,
): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(RateLimitStore), work).pipe(
      Effect.provide(RateLimitStore.layerOf(url)),
    ),
  );

export async function reachableRedis(database: number): Promise<string | null> {
  const url = scratchRedisUrl(database);
  if (!url) return unavailable('REDIS_URL is not set', null);
  const reachable = await onStore(url, (store) =>
    Effect.flatMap(store.ping, (reply) =>
      reply === 'ok'
        ? Effect.as(
            store.run((redis) => redis.flushdb()),
            true,
          )
        : Effect.succeed(false),
    ),
  );
  return reachable ? url : unavailable(`${url} is unreachable`, null);
}

/**
 * It deliberately does NOT empty the database: files that count a denial run
 * in parallel against it, so a flush here would spend another file's window.
 */
export async function reachableDeniedAuditStore(): Promise<boolean> {
  const { redis } = readEnv();
  if (!redis) return unavailable('REDIS_URL is not set', false);
  if ((await onStore(redis, (store) => store.ping)) === 'ok') return true;
  return unavailable(`${redis} is unreachable`, false);
}

export const testDeniedAttempts: Layer.Layer<DeniedAttempts> =
  DeniedAttempts.layer.pipe(
    Layer.provide(RateLimitStore.layer),
    Layer.provide(Layer.orDie(Environment.layer)),
  );

export const limiterWithoutStore: RateLimiter['Service'] = Effect.runSync(
  Effect.service(RateLimiter).pipe(
    Effect.provide(RateLimiter.layer),
    Effect.provide(RateLimitStore.layerAbsent),
  ),
);

export type OpenRateLimitStore = {
  readonly store: RateLimitStore['Service'];
  readonly limiter: (
    limits?: Partial<RateLimitSettings>,
  ) => RateLimiter['Service'];
  readonly dispose: () => Promise<void>;
};

export async function openRateLimitStore(
  url: string | null | undefined,
): Promise<OpenRateLimitStore> {
  const scope = Scope.makeUnsafe();
  const context = await Effect.runPromise(
    Layer.buildWithScope(
      url ? RateLimitStore.layerOf(url) : RateLimitStore.layerAbsent,
      scope,
    ),
  );
  return {
    store: Context.get(context, RateLimitStore),
    limiter: (limits = {}) =>
      Effect.runSync(
        Effect.service(RateLimiter).pipe(
          Effect.provide(RateLimiter.layerWith(limits)),
          Effect.provide(context),
        ),
      ),
    dispose: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  };
}
