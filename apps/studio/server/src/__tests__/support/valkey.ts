import { Context, Effect, Exit, Layer, Scope } from 'effect';

import { DeniedAttempts } from '../../audit/denial-rate-limit.ts';
import { Environment, readEnv } from '../../env.ts';
import { RateLimiter } from '../../rate-limit/limiter.ts';
import type { RateLimitSettings } from '../../rate-limit/scopes.ts';
import { RateLimitStore } from '../../rate-limit/store.ts';
import { CI } from './env.ts';

// Reaching a real Valkey, the way support/postgres.ts reaches a real Postgres:
// a suite that cannot find one is skipped locally and fails on CI, where the
// service container is part of the job and its absence is a broken workflow
// rather than a developer's machine.
//
// Each file takes a Redis logical database of its own and empties it. Vitest
// runs files in parallel processes against one server, and several of these
// scopes are keyed by the client address — which is the same address in every
// process — so a shared key space would have one file's requests spending
// another's allowance.

function unavailable<T>(reason: string, fallback: T): T {
  if (CI) throw new Error(`the Studio limiter suites cannot run: ${reason}`);
  return fallback;
}

/** Database indices, one per suite, so no two files share a key space. */
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
} as const;

/** `REDIS_URL` pointed at one logical database, or null when none is set. */
function scratchRedisUrl(database: number): string | null {
  const { redis } = readEnv();
  if (!redis) return null;
  const url = new URL(redis);
  url.pathname = `/${database}`;
  return url.toString();
}

/** One effect against a store of its own, closed once the effect is done. */
const onStore = <A>(
  url: string,
  work: (store: RateLimitStore['Service']) => Effect.Effect<A>,
): Promise<A> =>
  Effect.runPromise(
    Effect.flatMap(Effect.service(RateLimitStore), work).pipe(
      Effect.provide(RateLimitStore.layerOf(url)),
    ),
  );

/**
 * The URL of an empty logical database, or null to skip. Emptying it here
 * rather than per test is deliberate: a file's cases run in order, and each
 * one uses subjects of its own, so what has to be true is that nothing from a
 * previous *run* survives.
 */
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
 * Whether the process-wide store answers: `REDIS_URL` itself, which is what
 * the harness's `DeniedAttempts` reaches through (`testDeniedAttempts`),
 * rather than one of the scratch databases above.
 *
 * It exists because the audit denial window fails open (#1909). A case that
 * counts how many denial events one actor may write is asserting about a
 * limit that is not being applied when the store is missing, so it gets six
 * events instead of five and fails — where before the window was in memory
 * and always there. Such a case skips instead, the same way a database-backed
 * one does, and on CI this throws rather than skipping.
 *
 * It deliberately does NOT empty the database. Every file that counts a
 * denial counts in that one database, and they run in parallel, so a flush
 * here would spend another file's window.
 */
export async function reachableDeniedAuditStore(): Promise<boolean> {
  const { redis } = readEnv();
  if (!redis) return unavailable('REDIS_URL is not set', false);
  if ((await onStore(redis, (store) => store.ping)) === 'ok') return true;
  return unavailable(`${redis} is unreachable`, false);
}

/**
 * The denial window the programs build, over the process's own store — the
 * production wiring, for the harnesses whose audited commands reserve against
 * it. `reachableDeniedAuditStore` is what a case counting in it probes first.
 */
export const testDeniedAttempts: Layer.Layer<DeniedAttempts> =
  DeniedAttempts.layer.pipe(
    Layer.provide(RateLimitStore.layer),
    Layer.provide(Environment.layer),
  );

/**
 * A limiter over no store: every scope at its constant, and every call admitted
 * — the posture of a deployment with no `REDIS_URL`. What the rpc plane gets in
 * a suite that is not about limiting, where the programs would always provide a
 * limiter of their own.
 */
export const limiterWithoutStore: RateLimiter['Service'] = Effect.runSync(
  Effect.service(RateLimiter).pipe(
    Effect.provide(RateLimiter.layer),
    Effect.provide(RateLimitStore.layerAbsent),
  ),
);

/** A store a promise-driven suite holds open, and the limiters it builds over it. */
export type OpenRateLimitStore = {
  readonly store: RateLimitStore['Service'];
  /**
   * A limiter over this store, with the scopes in `limits` turned down and
   * every other at its constant. Cheap: a limiter owns nothing but its denial
   * log's state, so a suite can build one per case.
   */
  readonly limiter: (
    limits?: Partial<RateLimitSettings>,
  ) => RateLimiter['Service'];
  /** Ends the connection; a suite calls it in `afterAll`. */
  readonly dispose: () => Promise<void>;
};

/**
 * One connection for a suite that drives `createStudio` from promises rather
 * than from a layer. With no URL — the suite's probe found no store — it is the
 * absent store, and every limiter over it admits.
 */
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
