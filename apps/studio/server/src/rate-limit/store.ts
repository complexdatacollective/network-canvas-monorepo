import { Effect, Layer } from 'effect';
import { Redis } from 'ioredis';

// The one connection to the rate-limit store, and the only module that imports
// a Redis client (#1909). Everything above it — the limiter (src/rate-limit.ts)
// and the audit denial window (src/audit/denial-rate-limit.ts) — sees a surface
// that never throws: an operation either produces its result or produces
// `UNAVAILABLE`, and the caller's answer to that is always to allow the
// request. A rate limit protects against abuse; it is not a correctness
// guarantee, and an unreachable counter must not become an outage.
//
// One client per process, memoised by URL below. More than one is constructed
// only by the suites, which give each file a Redis logical database of its own
// so that files running in parallel do not spend each other's allowances.

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

export type RateLimitStore = {
  /**
   * Runs one operation against the store. `work` gets a connected client; a
   * connection that could not be made, a command that timed out and a Lua
   * error all arrive here as `UNAVAILABLE` rather than as a rejection.
   */
  run<T>(work: (redis: Redis) => Promise<T>): Promise<T | Unavailable>;
  /** Readiness (#1897): `ok` when PING answers inside the command timeout. */
  ping(): Promise<'ok' | Unavailable>;
  /** Ends the connection; a process's shutdown path calls it. */
  close(): Promise<void>;
};

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, ' ').trim().slice(0, 200);
}

export function createRateLimitStore(url: string): RateLimitStore {
  const client = new Redis(url, {
    // Nothing connects until the first limited request, so a deployment with
    // an unreachable store still boots and still serves.
    lazyConnect: true,
    // Both halves of failing fast: a command issued while the socket is down
    // is refused instead of being buffered until it comes back, and a command
    // already in flight is not retried behind the caller's back.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    commandTimeout: COMMAND_TIMEOUT_MS,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // ioredis's own reconnection loop is off so that every reconnection is one
    // this module asked for: with it on, a socket that dropped leaves the
    // client `reconnecting`, `connect()` rejects as "already connecting", and
    // the recovery path becomes whichever of the two got there first.
    retryStrategy: () => null,
    // A named client is what an operator sees in `CLIENT LIST` when they are
    // working out which process is holding a connection.
    connectionName: 'studio-rate-limit',
  });

  let lastWarnedAt = 0;
  function warn(reason: string): void {
    const now = Date.now();
    if (now - lastWarnedAt < WARN_INTERVAL_MS) return;
    lastWarnedAt = now;
    // oxlint-disable-next-line no-console -- failing-dependency diagnostics
    console.warn(
      `Rate limit store is unavailable; limits are not being enforced (${reason}).`,
    );
  }

  // Without a listener ioredis rethrows connection errors as an uncaught
  // 'error' event, which would turn the thing this module exists to survive
  // into a process exit.
  client.on('error', (error: unknown) => warn(describe(error)));

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

  return {
    run: async (work) => {
      try {
        await connected();
        return await work(client);
      } catch (error) {
        warn(describe(error));
        return UNAVAILABLE;
      }
    },
    ping: async () => {
      try {
        await connected();
        await client.ping();
        return 'ok';
      } catch (error) {
        warn(describe(error));
        return UNAVAILABLE;
      }
    },
    close: async () => {
      try {
        // `quit` on a client that never connected rejects; disconnect is the
        // unconditional form and this is a shutdown path either way.
        if (client.status === 'ready') await client.quit();
        else client.disconnect();
      } catch {
        client.disconnect();
      }
    },
  };
}

const stores = new Map<string, RateLimitStore>();

/**
 * The process's store for a URL. Memoised rather than constructed per caller:
 * `createApp` runs once in a deployment and many times in the suites, and a
 * client per app would be a socket per app.
 */
export function getRateLimitStore(url: string): RateLimitStore {
  const existing = stores.get(url);
  if (existing) return existing;
  const store = createRateLimitStore(url);
  stores.set(url, store);
  return store;
}

/** Ends every memoised connection; the entrypoints call it on SIGTERM. */
async function closeRateLimitStores(): Promise<void> {
  const open = [...stores.values()];
  stores.clear();
  await Promise.all(open.map((store) => store.close()));
}

/**
 * The stage-1 slot for stage 4's `RateLimitStoreLive`: today's memoised
 * stores, ended when the layer's scope closes. Acquired after the database
 * pool and before anything that enqueues, so it releases after the job
 * client stops and before the pool ends — the order the hand-written
 * shutdown handlers kept.
 */
export const RateLimitStoresLive: Layer.Layer<never> = Layer.effectDiscard(
  Effect.addFinalizer(() => Effect.promise(() => closeRateLimitStores())),
);
