import {
  Clock,
  Context,
  Effect,
  Layer,
  MutableRef,
  Option,
  PubSub,
  Schema,
  type Scope,
  Stream,
} from 'effect';
import { Redis } from 'ioredis';

import { Environment } from '../env.ts';

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

const PUBLISH_TIMEOUT_MS = 1_000;

const WARN_INTERVAL_MS = 60_000;

const RESYNC: DoorbellSignal = { _tag: 'Resync' };

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Tells every replica that a draft's log or presence moved. It carries no
 * content: a receiver reads the log, so a lost or reordered ring costs only
 * latency until the next read or safety poll.
 */
export class Doorbell extends Context.Service<
  Doorbell,
  {
    readonly ring: (message: DoorbellMessage) => Effect.Effect<void>;
    /** Subscribed when the effect returns, so nothing rung afterwards is missed. */
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
  }): Layer.Layer<Doorbell> =>
    Layer.effect(Doorbell, connectValkey(options.url, options.channel));

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

const subscribeTo = (hub: PubSub.PubSub<DoorbellSignal>) =>
  Effect.map(PubSub.subscribe(hub), Stream.fromSubscription);

/** One in-process hub; share the returned service between layers to model several replicas. */
export const makeMemoryDoorbell: Effect.Effect<
  Doorbell['Service'],
  never,
  Scope.Scope
> = Effect.gen(function* () {
  const hub = yield* PubSub.unbounded<DoorbellSignal>();
  yield* Effect.addFinalizer(() => PubSub.shutdown(hub));
  return Doorbell.of({
    ring: (message) => Effect.asVoid(PubSub.publish(hub, message)),
    signals: subscribeTo(hub),
    subscribed: Effect.succeed(true),
  });
});

const disconnect = (redis: Redis) => Effect.sync(() => redis.disconnect());

const connectValkey = Effect.fnUntraced(function* (
  url: string,
  channel: string,
) {
  const run = Effect.runForkWith(yield* Effect.context());
  const hub = yield* PubSub.unbounded<DoorbellSignal>();
  yield* Effect.addFinalizer(() => PubSub.shutdown(hub));

  const subscribed = MutableRef.make(false);
  const closing = MutableRef.make(false);
  const outage = MutableRef.make(false);
  const connection = MutableRef.make(0);

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

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const subscriber = new Redis(url, {
        connectionName: 'studio-doorbell',
        // ioredis resubscribes on its own with this on, but never reports
        // when the server confirms it; a confirmation is what makes a resync
        // read safe, so this subscribes on every `ready` instead.
        autoResubscribe: false,
      });
      subscriber.on('ready', () => {
        const current = MutableRef.incrementAndGet(connection);
        subscriber.subscribe(channel).then(
          () => {
            if (MutableRef.get(connection) !== current) return;
            MutableRef.set(subscribed, true);
            if (MutableRef.getAndSet(outage, false)) {
              run(Effect.logInfo('Protocol-builder doorbell resubscribed.'));
            }
            PubSub.publishUnsafe(hub, RESYNC);
          },
          (error: unknown) => {
            trouble(`subscribing failed (${describe(error)})`);
          },
        );
      });
      subscriber.on('close', () => {
        MutableRef.incrementAndGet(connection);
        const was = MutableRef.getAndSet(subscribed, false);
        if (was && !MutableRef.get(closing)) trouble('subscription lost');
      });
      // Without a listener ioredis rethrows connection errors as an uncaught
      // 'error' event.
      subscriber.on('error', (error: unknown) => {
        trouble(`connection error (${describe(error)})`);
      });
      subscriber.on('message', (from: string, payload: string) => {
        if (from !== channel) return;
        const decoded = decodePayload(payload);
        if (Option.isSome(decoded)) PubSub.publishUnsafe(hub, decoded.value);
      });
      return subscriber;
    }),
    (subscriber) =>
      Effect.andThen(
        Effect.sync(() => MutableRef.set(closing, true)),
        disconnect(subscriber),
      ),
  );

  const lastRingWarning = MutableRef.make(Number.NEGATIVE_INFINITY);
  const publisher = yield* Effect.acquireRelease(
    Effect.sync(() => {
      const redis = new Redis(url, {
        connectionName: 'studio-doorbell-publish',
        enableOfflineQueue: false,
        commandTimeout: PUBLISH_TIMEOUT_MS,
      });
      redis.on('error', (error: unknown) => {
        run(
          Effect.logDebug(
            `Protocol-builder doorbell publisher: ${describe(error)}`,
          ),
        );
      });
      return redis;
    }),
    disconnect,
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
      Effect.catch((error) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          if (now - MutableRef.get(lastRingWarning) < WARN_INTERVAL_MS) return;
          MutableRef.set(lastRingWarning, now);
          yield* Effect.logWarning(
            `Protocol-builder doorbell could not ring (${describe(error)}); other replicas see the change at their next safety poll.`,
          );
        }),
      ),
    );

  return Doorbell.of({
    ring,
    signals: subscribeTo(hub),
    subscribed: Effect.sync(() => MutableRef.get(subscribed)),
  });
});
