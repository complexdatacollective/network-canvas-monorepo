import {
  Cause,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  MutableRef,
  Ref,
} from 'effect';

import type { Database, MaintenanceDatabase } from '../db/client.ts';
import {
  type DeploymentState,
  readDeploymentState,
  readDeploymentStateAsMaintenance,
} from '../db/deployment-state.ts';

// Whether the deployment is in a maintenance window (#1901), as both processes
// read it: the web process's gate refuses every request while it is set
// (`http/middleware/maintenance.ts`), and the worker stops claiming jobs
// (`jobs/maintenance.ts`). The tag lives here, beside no implementation either
// process may not load (#1927 §6): the worker must not reach the HTTP gate and
// the web process must not reach `JobWorker`, and a tag declared in either
// module would drag its neighbour across.
//
// The flag is `deployment_state`'s, written only by `studio-api maintenance
// on|off` (`programs/maintenance.ts`). Each process reads it through its own
// client and role: the web process as the application role, the worker as the
// maintenance role, because each holds only the client it runs on.

/** What a reader learns: the switch, and the operator's reason while it is on. */
export type MaintenanceFlag = {
  readonly maintenance: boolean;
  readonly reason: string | null;
};

const OFF: MaintenanceFlag = { maintenance: false, reason: null };

/**
 * How long one answer stands. The design's second (#1927 §4): a request path
 * that read the row per request would put a statement in front of every
 * request, and one that read it less often would keep serving for longer
 * after `maintenance on` returned.
 */
const READING_TTL = Duration.seconds(1);

/**
 * How long a caller waits for a fresh answer before taking the last one. Half
 * of readiness's one-second bound per check (`http/health.ts`), so a reading
 * that has to give up still answers `/readyz` inside that check's second
 * rather than being reported as a check that timed out.
 */
const READING_BOUND = Duration.millis(500);

/**
 * A reading of something that can fail to answer — the flag, the migration
 * lock, the schema verdict — cached for `READING_TTL`, bounded by
 * `READING_BOUND`, and never failing.
 *
 * A reading that fails or times out answers **the last value it read**, and
 * `initial` until one has been read. A failed read is not evidence about what
 * it was reading: an unreachable database says nothing about whether an
 * operator ran `maintenance on`, and a gate that turned every failed read into
 * a closure would turn a database blip into a maintenance page. The database
 * being unreachable is readiness's `db` check to report, and a request that
 * reaches it fails on its own.
 *
 * Concurrent callers share one pending read (`Effect.cachedWithTTL`), so a
 * hung dependency costs one read per second per process, never one per
 * request, and no caller waits longer than the bound for it. The read runs in
 * the first caller's fiber, so that caller's interruption — a client that
 * hung up — interrupts it; such an exit is not cached (its time to live is
 * zero), and the callers that were waiting on it take the last value rather
 * than inherit someone else's interruption.
 */
export const cachedReading = <A>(options: {
  /** What is being read, for the one warning a run of failures logs. */
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
          // Once per run of failures: a database that stays down would
          // otherwise log this every second.
          if (!previous.failing) {
            yield* Ref.set(last, { ...previous, failing: true });
            yield* Effect.logWarning(
              `could not read ${options.name}; answering with the last value read until it can: ${Cause.pretty(cause)}`,
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

export class MaintenanceState extends Context.Service<
  MaintenanceState,
  {
    /**
     * The flag as last read, at most `READING_TTL` old. It cannot fail: see
     * `cachedReading` for what a failed read answers.
     */
    readonly read: Effect.Effect<MaintenanceFlag>;
  }
>()('@studio/MaintenanceState') {
  /**
   * The cached flag over any read of the row — the two live layers below, and
   * the suites' stand-ins for a read that fails or hangs. The read's services
   * are captured when the layer builds, so the cached effect needs none.
   */
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

  /** The web process's: the row as the application role reads it. */
  static readonly layer: Layer.Layer<MaintenanceState, never, Database> =
    MaintenanceState.layerFrom(readDeploymentState());

  /** The worker's: the row on the maintenance client, the only one it holds. */
  static readonly layerMaintenance: Layer.Layer<
    MaintenanceState,
    never,
    MaintenanceDatabase
  > = MaintenanceState.layerFrom(readDeploymentStateAsMaintenance());

  /**
   * The suites' implementation: a reference a case flips between ticks. Not
   * `Layer.succeed(MaintenanceState)(…)` over a boolean — the point of the
   * gates is that the answer changes while they run.
   */
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

  /** Never in maintenance: for suites whose subject is something else. */
  static readonly layerOff: Layer.Layer<MaintenanceState> = Layer.succeed(
    MaintenanceState,
  )(MaintenanceState.of({ read: Effect.succeed(OFF) }));
}
