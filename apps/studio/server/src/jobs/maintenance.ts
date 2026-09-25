import { Cause, Duration, Effect, Layer, MutableRef, Schedule } from 'effect';

import { MaintenanceState } from '../platform/maintenance-state.ts';
import { JobWorker } from './worker.ts';

// Maintenance mode, as it reaches the queue: while a deployment is in
// maintenance the worker claims nothing at all — #1927 §20 Q9 answers "which
// queues stop" with "all of them", so this is one flag over the whole worker
// rather than a per-queue gate, and it is the worker's own `setFetching`,
// which is what the poll fibers read before each claim. A handler already in
// flight is not interrupted: maintenance stops new work, and the graceful
// stop (worker.ts) is what bounds the work already running.
//
// The flag is `MaintenanceState`'s (`platform/maintenance-state.ts`), the same
// cached read of `deployment_state` the web process's gate consults; nothing
// here reads that table, because the queue must not grow a second opinion
// about what maintenance is. That read cannot fail — a failed read answers
// the last state it knew — so the gate never has to guess, which would either
// claim through a maintenance window or stop claiming because a query timed
// out.

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
