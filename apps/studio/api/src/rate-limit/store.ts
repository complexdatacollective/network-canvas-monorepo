import { Clock, Context, Effect, Layer, MutableRef } from 'effect';
import { Redis } from 'ioredis';

import { Environment } from '../env.ts';

export const UNAVAILABLE = 'unavailable';
export type Unavailable = typeof UNAVAILABLE;

const COMMAND_TIMEOUT_MS = 250;

const CONNECT_TIMEOUT_MS = 2_000;

const WARN_INTERVAL_MS = 60_000;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, ' ').trim().slice(0, 200);
}

export class RateLimitStore extends Context.Service<
  RateLimitStore,
  {
    readonly configured: boolean;
    readonly run: <A>(
      work: (redis: Redis) => Promise<A>,
    ) => Effect.Effect<A | Unavailable>;
    readonly ping: Effect.Effect<'ok' | Unavailable>;
  }
>()('@studio/RateLimitStore') {
  static readonly layerOf = (url: string): Layer.Layer<RateLimitStore> =>
    Layer.effect(RateLimitStore, connect(url));

  static readonly layerAbsent: Layer.Layer<RateLimitStore> = Layer.succeed(
    RateLimitStore,
  )(
    RateLimitStore.of({
      configured: false,
      run: () => Effect.succeed(UNAVAILABLE),
      ping: Effect.succeed(UNAVAILABLE),
    }),
  );

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
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 0,
          commandTimeout: COMMAND_TIMEOUT_MS,
          connectTimeout: CONNECT_TIMEOUT_MS,
          // ioredis's own reconnection loop is off: with it on, `connect()`
          // rejects as "already connecting" after a dropped socket.
          retryStrategy: () => null,
          connectionName: 'studio-rate-limit',
        }),
    ),
    (redis) =>
      Effect.promise(async () => {
        try {
          // `quit` on a client that never connected rejects.
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
  // 'error' event.
  const context = yield* Effect.context();
  client.on('error', (error: unknown) => {
    Effect.runForkWith(context)(warn(describe(error)));
  });

  let connecting: Promise<unknown> | undefined;
  function connected(): Promise<unknown> {
    if (client.status === 'ready') return Promise.resolve();
    connecting ??= client.connect().finally(() => {
      connecting = undefined;
    });
    return connecting;
  }

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
