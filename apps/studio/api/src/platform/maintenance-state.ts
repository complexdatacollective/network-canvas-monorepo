import { Context, Duration, Effect, Layer, MutableRef, Ref } from 'effect';

import type { Database, MaintenanceDatabase } from '../db/client.ts';
import {
  type DeploymentState,
  readDeploymentState,
  readDeploymentStateAsMaintenance,
} from '../db/deployment-state.ts';
import { logFailedReading } from '../db/errors.ts';

// The tag lives here, beside no implementation either process may not load.

export type MaintenanceFlag = {
  readonly maintenance: boolean;
  readonly reason: string | null;
};

const OFF: MaintenanceFlag = { maintenance: false, reason: null };

const READING_TTL = Duration.seconds(1);

/** Half of readiness's one-second bound per check (`http/health.ts`). */
export const READING_BOUND = Duration.millis(500);

export type CachedReading<A> = {
  /** The value, read at most once per `READING_TTL`. */
  readonly read: Effect.Effect<A>;
  /**
   * Replaces the value a failed or slow reading falls back to, and drops the
   * cached one, so the next `read` reads afresh: for a caller that has read
   * past the cache and knows the value it held is no longer true.
   */
  readonly seed: (value: A) => Effect.Effect<void>;
};

/**
 * A reading that fails or times out answers the last value it read, and
 * `initial` until one has been read.
 */
export const cachedReading = <A>(options: {
  readonly name: string;
  readonly read: Effect.Effect<A, unknown>;
  readonly initial: A;
}): Effect.Effect<CachedReading<A>> =>
  Effect.gen(function* () {
    const last = yield* Ref.make({ value: options.initial, failing: false });
    const lastValue = Effect.map(Ref.get(last), ({ value }) => value);

    const fresh = options.read.pipe(
      Effect.timeout(READING_BOUND),
      Effect.tap((value) => Ref.set(last, { value, failing: false })),
      Effect.catchCause((cause) =>
        Effect.gen(function* () {
          const previous = yield* Ref.get(last);
          if (!previous.failing) {
            yield* Ref.set(last, { ...previous, failing: true });
            yield* logFailedReading(
              `could not read ${options.name}; answering with the last value read until it can`,
              cause,
            );
          }
          return previous.value;
        }),
      ),
    );

    // `fresh` cannot fail — a failed reading answers the last value — so every
    // answer is kept for the whole TTL.
    const [cached, invalidate] = yield* Effect.cachedInvalidateWithTTL(
      fresh,
      READING_TTL,
    );
    return {
      read: cached.pipe(Effect.catchCause(() => lastValue)),
      seed: (value) =>
        Effect.andThen(Ref.set(last, { value, failing: false }), invalidate),
    };
  });

export class MaintenanceState extends Context.Service<
  MaintenanceState,
  {
    readonly read: Effect.Effect<MaintenanceFlag>;
  }
>()('@studio/MaintenanceState') {
  static readonly layerFrom = <E, R>(
    read: Effect.Effect<DeploymentState, E, R>,
  ): Layer.Layer<MaintenanceState, never, R> =>
    Layer.effect(
      MaintenanceState,
      Effect.gen(function* () {
        const context = yield* Effect.context<R>();
        const reading = yield* cachedReading({
          name: 'the deployment state',
          read: read.pipe(
            Effect.map(({ maintenance, reason }): MaintenanceFlag => ({
              maintenance,
              reason,
            })),
            Effect.provideContext(context),
          ),
          initial: OFF,
        });
        return MaintenanceState.of({ read: reading.read });
      }),
    );

  static readonly layer: Layer.Layer<MaintenanceState, never, Database> =
    MaintenanceState.layerFrom(readDeploymentState());

  static readonly layerMaintenance: Layer.Layer<
    MaintenanceState,
    never,
    MaintenanceDatabase
  > = MaintenanceState.layerFrom(readDeploymentStateAsMaintenance());

  static readonly layerTest = (
    ref: MutableRef.MutableRef<boolean>,
  ): Layer.Layer<MaintenanceState> =>
    Layer.succeed(MaintenanceState)(
      MaintenanceState.of({
        read: Effect.sync(() => ({
          maintenance: MutableRef.get(ref),
          reason: null,
        })),
      }),
    );

  static readonly layerOff: Layer.Layer<MaintenanceState> = Layer.succeed(
    MaintenanceState,
  )(MaintenanceState.of({ read: Effect.succeed(OFF) }));
}
