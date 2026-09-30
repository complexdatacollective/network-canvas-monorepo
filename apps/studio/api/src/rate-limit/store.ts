import { Clock, Context, Effect, Layer, MutableRef } from 'effect';
import { Redis } from 'ioredis';

import { Environment } from '../env.ts';

// The one connection to the rate-limit store, and the only module that imports
// a Redis client (#1909). Everything above it — the limiter
// (src/rate-limit/limiter.ts), the audit denial window
// (src/audit/denial-rate-limit.ts) and the denied-attempts summary job
// (src/jobs/handlers/denied-attempts/store.ts) — sees a surface that never
// fails: an operation either produces its result or produces `UNAVAILABLE`,
// and the caller's answer to that is always to allow the request. A rate limit
// protects against abuse; it is not a correctness guarantee, and an
// unreachable counter must not become an outage.
//
// One client per layer, and the program builds the layer once, so one client
// per process. More than one is constructed only by the suites, which give each
// file a Redis logical database of its own (`RateLimitStore.layerOf`) so that
// files running in parallel do not spend each other's allowances. The layer is
// the memo, and its finalizer is the close.

/** What an operation returns when the store could not answer it. */
export const UNAVAILABLE = 'unavailable';
export type Unavailable = typeof UNAVAILABLE;

/**
 * A quarter of a second. The store sits on the request path of every limited
 * surface, so the bound is what a person would not notice added to a page
 * load, not what a slow network could eventually deliver — a limiter that
 * waits is worse than a limiter that fails open, because waiting is an outage
 * the store's own unreachability was not.
 */
const COMMAND_TIMEOUT_MS = 250;

/**
 * Connecting is generous where commanding is strict. It happens once per
 * process rather than once per request, so it is not what a person waits on,
 * and refusing it inside the command budget would make a momentarily busy
 * machine look like an outage.
 */
const CONNECT_TIMEOUT_MS = 2_000;

/** One line a minute, whatever the request rate: this is a failing dependency. */
const WARN_INTERVAL_MS = 60_000;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, ' ').trim().slice(0, 200);
}

export class RateLimitStore extends Context.Service<
  RateLimitStore,
  {
    /**
     * False when the deployment names no store at all. Readiness omits its
     * check then, and every operation answers `UNAVAILABLE` without touching a
     * socket — which every caller already reads as "admit".
     */
    readonly configured: boolean;
    /**
     * Runs one operation against the store. `work` gets a connected client; a
     * connection that could not be made, a command that timed out and a Lua
     * error all arrive here as `UNAVAILABLE` rather than as a failure.
     */
    readonly run: <A>(
      work: (redis: Redis) => Promise<A>,
    ) => Effect.Effect<A | Unavailable>;
    /** Readiness (#1897): `ok` when PING answers inside the command timeout. */
    readonly ping: Effect.Effect<'ok' | Unavailable>;
  }
>()('@studio/RateLimitStore') {
  /**
   * One lazy client against `url`. The suites build this directly, one
   * logical database per file; a program takes `layer`, which reads the URL
   * from the environment.
   */
  static readonly layerOf = (url: string): Layer.Layer<RateLimitStore> =>
    Layer.effect(RateLimitStore, connect(url));

  /**
   * No store configured. `run` and `ping` answer `UNAVAILABLE` without doing
   * anything, which is the posture an unreachable store already has, so no
   * caller needs a second branch for it; `configured` is what tells the two
   * apart where it matters (readiness, and the summary job's outcome line).
   */
  static readonly layerAbsent: Layer.Layer<RateLimitStore> = Layer.succeed(
    RateLimitStore,
  )(
    RateLimitStore.of({
      configured: false,
      run: () => Effect.succeed(UNAVAILABLE),
      ping: Effect.succeed(UNAVAILABLE),
    }),
  );

  /**
   * The process's store: `REDIS_URL`'s, or none. A deployment without one
   * boots and serves with no limit enforced, and says so once, at boot,
   * outside development — the reference compose stack always sets it.
   */
  static readonly layer: Layer.Layer<RateLimitStore, never, Environment> =
    Layer.unwrap(
      Effect.gen(function* () {
        const env = yield* Environment;
        if (env.redis) return RateLimitStore.layerOf(env.redis);
        if (!env.devDefaults) {
          yield* Effect.logWarning(
            'REDIS_URL is not set: no rate limit is enforced. Sign-in, invitation, RPC, storage, public API and WebSocket limits all depend on it.',
          );
        }
        return RateLimitStore.layerAbsent;
      }),
    );
}

const connect = Effect.fnUntraced(function* (url: string) {
  const client = yield* Effect.acquireRelease(
    Effect.sync(
      () =>
        new Redis(url, {
          // Nothing connects until the first limited request, so a deployment
          // with an unreachable store still boots and still serves.
          lazyConnect: true,
          // Both halves of failing fast: a command issued while the socket is
          // down is refused instead of being buffered until it comes back, and
          // a command already in flight is not retried behind the caller's
          // back.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          commandTimeout: COMMAND_TIMEOUT_MS,
          connectTimeout: CONNECT_TIMEOUT_MS,
          // ioredis's own reconnection loop is off so that every reconnection
          // is one this module asked for: with it on, a socket that dropped
          // leaves the client `reconnecting`, `connect()` rejects as "already
          // connecting", and the recovery path becomes whichever of the two
          // got there first.
          retryStrategy: () => null,
          // A named client is what an operator sees in `CLIENT LIST` when they
          // are working out which process is holding a connection.
          connectionName: 'studio-rate-limit',
        }),
    ),
    (redis) =>
      Effect.promise(async () => {
        try {
          // `quit` on a client that never connected rejects; disconnect is
          // the unconditional form and this is a shutdown path either way.
          if (redis.status === 'ready') await redis.quit();
          else redis.disconnect();
        } catch {
          redis.disconnect();
        }
      }),
  );

  const lastWarnedAt = MutableRef.make(Number.NEGATIVE_INFINITY);
  const warn = Effect.fnUntraced(function* (reason: string) {
    const now = yield* Clock.currentTimeMillis;
    if (now - MutableRef.get(lastWarnedAt) < WARN_INTERVAL_MS) return;
    MutableRef.set(lastWarnedAt, now);
    yield* Effect.logWarning(
      `Rate limit store is unavailable; limits are not being enforced (${reason}).`,
    );
  });

  // Without a listener ioredis rethrows connection errors as an uncaught
  // 'error' event, which would turn the thing this module exists to survive
  // into a process exit. The event arrives outside any fiber, so the warning
  // runs on the services the layer was built with — the program's logger.
  const context = yield* Effect.context();
  client.on('error', (error: unknown) => {
    Effect.runForkWith(context)(warn(describe(error)));
  });

  let connecting: Promise<unknown> | undefined;
  function connected(): Promise<unknown> {
    if (client.status === 'ready') return Promise.resolve();
    // One connect attempt at a time, whatever the request concurrency; the
    // memo is cleared either way so the next request after a failure retries.
    connecting ??= client.connect().finally(() => {
      connecting = undefined;
    });
    return connecting;
  }

  /** Every failure is `UNAVAILABLE`, warned about at most once a minute. */
  const unavailable = <A>(
    operation: Effect.Effect<A, unknown>,
  ): Effect.Effect<A | Unavailable> =>
    operation.pipe(
      Effect.catch((error): Effect.Effect<Unavailable> =>
        Effect.as(warn(describe(error)), UNAVAILABLE),
      ),
    );

  return RateLimitStore.of({
    configured: true,
    run: (work) =>
      unavailable(
        Effect.tryPromise({
          try: async () => {
            await connected();
            return await work(client);
          },
          catch: (error) => error,
        }),
      ),
    ping: unavailable(
      Effect.tryPromise({
        try: async () => {
          await connected();
          await client.ping();
          return 'ok' as const;
        },
        catch: (error) => error,
      }),
    ),
  });
});
