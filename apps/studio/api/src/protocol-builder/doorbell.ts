import {
  Context,
  Duration,
  Effect,
  Layer,
  MutableRef,
  Option,
  PubSub,
  Schedule,
  Schema,
  type Scope,
  Stream,
} from 'effect';
import { Redis } from 'ioredis';

import { Environment } from '../env.ts';
import {
  describeValkeyError,
  throttledWarning,
} from '../platform/valkey-log.ts';

const DoorbellMessage = Schema.Union([
  Schema.TaggedStruct('Advanced', {
    draftId: Schema.String,
    cursor: Schema.String,
  }),
  Schema.TaggedStruct('Presence', { draftId: Schema.String }),
]);

type DoorbellMessage = typeof DoorbellMessage.Type;

type DoorbellSignal = DoorbellMessage | { readonly _tag: 'Resync' };

const DoorbellPayload = Schema.fromJsonString(DoorbellMessage);

const decodePayload = Schema.decodeUnknownOption(DoorbellPayload);

const encodePayload = Schema.encodeEffect(DoorbellPayload);

const DEFAULT_CHANNEL = 'studio:protocol-events';

const DEFAULT_CONNECTION_NAME = 'studio-doorbell';

const PUBLISH_TIMEOUT_MS = 1_000;

const PING_INTERVAL = Duration.seconds(10);

const PING_TIMEOUT = Duration.seconds(2);

const RESUBSCRIBE_BASE_MS = 200;

const RESUBSCRIBE_CAP_MS = 30_000;

const SIGNAL_CAPACITY = 1024;

const RESYNC: DoorbellSignal = { _tag: 'Resync' };

/**
 * Tells every replica that a draft's log or presence moved. It carries no
 * content: a receiver reads the log, so a lost or reordered ring costs only
 * latency until the next read or safety poll.
 */
export class Doorbell extends Context.Service<
  Doorbell,
  {
    readonly ring: (message: DoorbellMessage) => Effect.Effect<void>;
    /**
     * Subscribed to the local hub when the effect returns. A ring missed
     * while the transport was unsubscribed, or dropped because a consumer
     * fell behind, is followed by a `Resync`. No `Resync` is promised at
     * start (the memory doorbell never sends one), so a consumer makes its
     * own first read.
     */
    readonly signals: Effect.Effect<
      Stream.Stream<DoorbellSignal>,
      never,
      Scope.Scope
    >;
    readonly subscribed: Effect.Effect<boolean>;
  }
>()('@studio/Doorbell') {
  static readonly layerMemory: Layer.Layer<Doorbell> = Layer.effect(
    Doorbell,
    Effect.suspend(() => makeMemoryDoorbell),
  );

  static readonly layerValkey = (options: {
    readonly url: string;
    readonly channel: string;
    /** Names the subscriber in `CLIENT LIST`; the publisher appends `-publish`. */
    readonly connectionName?: string;
  }): Layer.Layer<Doorbell> => Layer.effect(Doorbell, connectValkey(options));

  static readonly layer: Layer.Layer<Doorbell, never, Environment> =
    Layer.unwrap(
      Effect.gen(function* () {
        const env = yield* Environment;
        return env.redis
          ? Doorbell.layerValkey({ url: env.redis, channel: DEFAULT_CHANNEL })
          : Doorbell.layerMemory;
      }),
    );
}

/**
 * A bounded hub that never blocks a ring. When it is full, signals are
 * dropped and one `Resync` is owed, delivered ahead of the next signal that
 * fits; until then the consumer's safety poll covers the gap.
 */
const makeHub = Effect.gen(function* () {
  const pubsub = yield* PubSub.dropping<DoorbellSignal>(SIGNAL_CAPACITY);
  yield* Effect.addFinalizer(() => PubSub.shutdown(pubsub));
  const owed = MutableRef.make(false);
  const offer = (signal: DoorbellSignal): void => {
    if (MutableRef.get(owed)) {
      if (!PubSub.publishUnsafe(pubsub, RESYNC)) return;
      MutableRef.set(owed, false);
      if (signal._tag === 'Resync') return;
    }
    if (!PubSub.publishUnsafe(pubsub, signal)) MutableRef.set(owed, true);
  };
  return {
    offer,
    signals: Effect.map(PubSub.subscribe(pubsub), Stream.fromSubscription),
  };
});

/** One in-process hub; share the returned service between layers to model several replicas. */
export const makeMemoryDoorbell: Effect.Effect<
  Doorbell['Service'],
  never,
  Scope.Scope
> = Effect.gen(function* () {
  const hub = yield* makeHub;
  return Doorbell.of({
    ring: (message) => Effect.sync(() => hub.offer(message)),
    signals: hub.signals,
    subscribed: Effect.succeed(true),
  });
});

const disconnect = (redis: Redis) => Effect.sync(() => redis.disconnect());

const connectValkey = Effect.fnUntraced(function* (options: {
  readonly url: string;
  readonly channel: string;
  readonly connectionName?: string;
}) {
  const { url, channel } = options;
  const connectionName = options.connectionName ?? DEFAULT_CONNECTION_NAME;
  const run = Effect.runForkWith(yield* Effect.context());
  const hub = yield* makeHub;

  const subscribed = MutableRef.make(false);
  const closing = MutableRef.make(false);
  const outage = MutableRef.make(false);
  const connection = MutableRef.make(0);
  const refusals = MutableRef.make(0);

  const trouble = (what: string) => {
    if (MutableRef.getAndSet(outage, true)) {
      run(Effect.logDebug(`Protocol-builder doorbell: ${what}`));
      return;
    }
    run(
      Effect.logWarning(
        `Protocol-builder doorbell: ${what}; cross-replica updates fall back to the safety poll until it resubscribes.`,
      ),
    );
  };

  const isCurrent = (epoch: number) =>
    MutableRef.get(connection) === epoch && !MutableRef.get(closing);

  const subscriber = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const redis = new Redis(url, {
        connectionName,
        // ioredis resubscribes on its own with this on, but never reports
        // when the server confirms it; a confirmation is what makes a resync
        // read safe, so this subscribes on every `ready` instead.
        autoResubscribe: false,
      });
      redis.on('ready', () => {
        const epoch = MutableRef.incrementAndGet(connection);
        redis.subscribe(channel).then(
          () => {
            if (!isCurrent(epoch)) return;
            MutableRef.set(refusals, 0);
            MutableRef.set(subscribed, true);
            if (MutableRef.getAndSet(outage, false)) {
              run(Effect.logInfo('Protocol-builder doorbell resubscribed.'));
            }
            hub.offer(RESYNC);
          },
          (error: unknown) => {
            if (!isCurrent(epoch)) return;
            trouble(`subscribing failed (${describeValkeyError(error)})`);
            // `ready` resets ioredis's own backoff, so a server that keeps
            // refusing SUBSCRIBE is retried on this schedule instead.
            const delay = Math.min(
              RESUBSCRIBE_CAP_MS,
              RESUBSCRIBE_BASE_MS *
                2 ** Math.min(8, MutableRef.getAndIncrement(refusals)),
            );
            setTimeout(() => {
              if (isCurrent(epoch)) redis.disconnect(true);
            }, delay).unref();
          },
        );
      });
      redis.on('close', () => {
        MutableRef.incrementAndGet(connection);
        const was = MutableRef.getAndSet(subscribed, false);
        if (was && !MutableRef.get(closing)) trouble('subscription lost');
      });
      // Without a listener ioredis rethrows connection errors as an uncaught
      // 'error' event.
      redis.on('error', (error: unknown) => {
        trouble(`connection error (${describeValkeyError(error)})`);
      });
      redis.on('message', (from: string, payload: string) => {
        if (from !== channel) return;
        const decoded = decodePayload(payload);
        if (Option.isSome(decoded)) hub.offer(decoded.value);
      });
      return redis;
    }),
    (redis) =>
      Effect.andThen(
        Effect.sync(() => MutableRef.set(closing, true)),
        disconnect(redis),
      ),
  );

  // A half-open socket raises no `close`, so `subscribed` would stay true
  // while nothing arrives; a PING that goes unanswered forces a reconnect.
  const probe = Effect.suspend(() => {
    if (!MutableRef.get(subscribed)) return Effect.void;
    const epoch = MutableRef.get(connection);
    return Effect.tryPromise({
      try: () => subscriber.ping(),
      catch: (error) => error,
    }).pipe(
      Effect.timeout(PING_TIMEOUT),
      Effect.asVoid,
      Effect.catch((error) =>
        Effect.sync(() => {
          if (!isCurrent(epoch)) return;
          trouble(`no answer to PING (${describeValkeyError(error)})`);
          subscriber.disconnect(true);
        }),
      ),
    );
  });
  yield* Effect.forkScoped(
    Effect.repeat(probe, Schedule.spaced(PING_INTERVAL)),
  );

  const publisher = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const redis = new Redis(url, {
        connectionName: `${connectionName}-publish`,
        enableOfflineQueue: false,
        commandTimeout: PUBLISH_TIMEOUT_MS,
      });
      redis.on('error', (error: unknown) => {
        run(
          Effect.logDebug(
            `Protocol-builder doorbell publisher: ${describeValkeyError(error)}`,
          ),
        );
      });
      return redis;
    }),
    disconnect,
  );

  const warnRing = throttledWarning(
    (reason) =>
      `Protocol-builder doorbell could not ring (${reason}); other replicas see the change at their next safety poll.`,
  );

  const ring = (message: DoorbellMessage): Effect.Effect<void> =>
    encodePayload(message).pipe(
      Effect.flatMap((payload) =>
        Effect.tryPromise({
          try: () => publisher.publish(channel, payload),
          catch: (error) => error,
        }),
      ),
      Effect.asVoid,
      Effect.catch((error) => warnRing(describeValkeyError(error))),
    );

  return Doorbell.of({
    ring,
    signals: hub.signals,
    subscribed: Effect.sync(() => MutableRef.get(subscribed)),
  });
});
