import {
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  MutableRef,
  Option,
  Ref,
} from 'effect';

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
const READING_BOUND = Duration.millis(500);

/**
 * A reading that fails or times out answers the last value it read, and
 * `initial` until one has been read.
 */
export const cachedReading = <A>(options: {
  readonly name: string;
  readonly read: Effect.Effect<A, unknown>;
  readonly initial: A;
}): Effect.Effect<Effect.Effect<A>> =>
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

    const cached = yield* Effect.cachedWithTTL(fresh, (exit) =>
      Exit.isSuccess(exit) ? READING_TTL : Duration.zero,
    );
    return cached.pipe(Effect.catchCause(() => lastValue));
  });

/**
 * A reading that answers only for the window it was taken in. `window` counts
 * the windows its caller has seen, and moves when one begins; a value read
 * while it moved, or before its last move, answers nothing, so the caller can
 * tell "not read since" from any value. Within one window it is
 * `cachedReading`: one read at a time, kept for `READING_TTL`, and a failed or
 * slow read answering the last value read in that window. Each window has its
 * own cache, so a read still running when a window begins can neither answer
 * nor be kept for the windows after it.
 */
export const windowedReading = <A>(options: {
  readonly name: string;
  readonly read: Effect.Effect<A, unknown>;
  readonly initial: A;
  readonly window: Effect.Effect<number>;
}): Effect.Effect<Effect.Effect<Option.Option<A>>> =>
  Effect.gen(function* () {
    const last = yield* Ref.make({ value: options.initial, window: 0 });
    const failing = yield* Ref.make(false);

    const readIn = (window: number) =>
      options.read.pipe(
        Effect.timeout(READING_BOUND),
        Effect.matchCauseEffect({
          onSuccess: (value) =>
            Effect.gen(function* () {
              yield* Ref.set(failing, false);
              if ((yield* options.window) === window) {
                yield* Ref.set(last, { value, window });
              }
            }),
          onFailure: (cause) =>
            Effect.gen(function* () {
              if (yield* Ref.getAndSet(failing, true)) return;
              yield* logFailedReading(
                `could not read ${options.name}; answering with the last value read since the deployment last closed, or nothing, until it can`,
                cause,
              );
            }),
        }),
      );

    const caches = yield* Ref.make<{
      readonly window: number;
      readonly sample: Effect.Effect<void>;
    } | null>(null);
    const cacheFor = Effect.fnUntraced(function* (window: number) {
      const installed = yield* Ref.get(caches);
      if (installed?.window === window) return installed.sample;
      const sample = yield* Effect.cachedWithTTL(readIn(window), READING_TTL);
      // Concurrent first reads of a window share whichever cache lands first;
      // a caller still in an older window reads alone rather than replace it.
      return yield* Ref.modify(caches, (current) =>
        current !== null && current.window >= window
          ? [current.window === window ? current.sample : sample, current]
          : [sample, { window, sample }],
      );
    });

    return Effect.gen(function* () {
      const sample = yield* cacheFor(yield* options.window);
      yield* Effect.ignoreCause(sample);
      const held = yield* Ref.get(last);
      return held.window === (yield* options.window)
        ? Option.some(held.value)
        : Option.none();
    });
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
        return MaintenanceState.of({ read: reading });
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
