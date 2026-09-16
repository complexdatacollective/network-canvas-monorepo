import {
  Cause,
  Context,
  Duration,
  Effect,
  Layer,
  MutableRef,
  Schedule,
} from 'effect';

import { JobWorker } from './worker.ts';

// Maintenance mode, as it reaches the queue: while a deployment is in
// maintenance the worker claims nothing at all — #1927 §20 Q9 answers "which
// queues stop" with "all of them", so this is one flag over the whole worker
// rather than a per-queue gate, and it is the worker's own `setFetching`,
// which is what the poll fibers read before each claim. A handler already in
// flight is not interrupted: maintenance stops new work, and the graceful
// stop (worker.ts) is what bounds the work already running.

/**
 * Whether the deployment is in maintenance. Stage 3 provides the live
 * implementation over `deployment_state`; nothing here reads that table,
 * because the queue must not grow a second opinion about what maintenance is.
 *
 * `read` cannot fail, which is a decision the live implementation inherits:
 * a read of `deployment_state` that errors has to answer with the last state
 * it knew rather than hand the gate a failure, because the only thing the
 * gate could do with one is guess — and a guess either claims through a
 * maintenance window or stops claiming because a query timed out.
 */
export class MaintenanceState extends Context.Service<
  MaintenanceState,
  {
    readonly read: Effect.Effect<{ readonly maintenance: boolean }>;
  }
>()('@studio/jobs/MaintenanceState') {
  /**
   * The suites' implementation: a reference a case flips between ticks. Not
   * `Layer.succeed(MaintenanceState)(…)` over a boolean — the point of the
   * gate is that the answer changes while the fiber runs.
   */
  static readonly layerTest = (
    ref: MutableRef.MutableRef<boolean>,
  ): Layer.Layer<MaintenanceState> =>
    Layer.succeed(MaintenanceState)(
      MaintenanceState.of({
        read: Effect.sync(() => ({ maintenance: MutableRef.get(ref) })),
      }),
    );

  /**
   * Never in maintenance, which is what the worker program provides: Studio has
   * no maintenance mode yet. The stage that introduces one replaces this with a
   * read of `deployment_state` and nothing else about the gate changes — which
   * is why the gate is mounted now rather than left out, so the wiring is not a
   * second thing that stage has to get right.
   */
  static readonly layerOff: Layer.Layer<MaintenanceState> = Layer.succeed(
    MaintenanceState,
  )(MaintenanceState.of({ read: Effect.succeed({ maintenance: false }) }));
}

/** How often the gate asks; a second, as the deployment gate polls. */
const DEFAULT_POLL_INTERVAL = Duration.seconds(1);

export type JobMaintenanceGateConfig = {
  readonly pollInterval?: Duration.Input | undefined;
};

export const JobMaintenanceGate = {
  /**
   * The gate fiber. It calls `setFetching` only when the answer changes, so
   * the log carries one line per transition rather than one a second, and a
   * read that fails is logged and retried on the next tick rather than
   * killing the fiber — a gate that died would leave the worker fetching
   * through a maintenance window with nothing saying why.
   */
  layer: (
    config: JobMaintenanceGateConfig = {},
  ): Layer.Layer<never, never, JobWorker | MaintenanceState> =>
    Layer.effectDiscard(
      Effect.gen(function* () {
        const worker = yield* JobWorker;
        const state = yield* MaintenanceState;
        // `null` until the first tick, so the first answer is always applied:
        // a process that boots into maintenance must not start by claiming.
        const applied = MutableRef.make<boolean | null>(null);

        const tick = Effect.gen(function* () {
          const { maintenance } = yield* state.read;
          const fetching = !maintenance;
          const previous = MutableRef.get(applied);
          if (previous === fetching) return;
          MutableRef.set(applied, fetching);
          yield* worker.setFetching(fetching);
          if (!fetching) {
            yield* Effect.logWarning(
              'the deployment is in maintenance: the job worker has stopped claiming jobs on every queue',
            );
            return;
          }
          // Nothing at boot: "jobs are running" is only news after a pause.
          if (previous !== null) {
            yield* Effect.logInfo(
              'maintenance is over: the job worker is claiming jobs again',
            );
          }
        });

        yield* Effect.forkScoped(
          tick.pipe(
            Effect.catchCause((cause) =>
              Effect.logError(
                `the job maintenance gate failed to read the deployment state: ${Cause.pretty(cause)}`,
              ),
            ),
            Effect.repeat(
              Schedule.spaced(config.pollInterval ?? DEFAULT_POLL_INTERVAL),
            ),
          ),
        );
      }),
    ),
} as const;
