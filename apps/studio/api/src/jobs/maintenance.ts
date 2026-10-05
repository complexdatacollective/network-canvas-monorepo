import { Cause, Duration, Effect, Layer, MutableRef } from 'effect';

import { MaintenanceState } from '../platform/maintenance-state.ts';
import { JobWorker } from './worker.ts';

const DEFAULT_POLL_INTERVAL = Duration.seconds(1);

export type JobMaintenanceGateConfig = {
  readonly pollInterval?: Duration.Input | undefined;
};

export const JobMaintenanceGate = {
  layer: (
    config: JobMaintenanceGateConfig = {},
  ): Layer.Layer<never, never, JobWorker | MaintenanceState> =>
    Layer.effectDiscard(
      Effect.gen(function* () {
        const worker = yield* JobWorker;
        const state = yield* MaintenanceState;
        // `null` until the first tick, so the first answer is always applied: that is
        // what opens a worker built with `startPaused`.
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
          if (previous !== null) {
            yield* Effect.logInfo(
              'maintenance is over: the job worker is claiming jobs again',
            );
          }
        });

        const guarded = tick.pipe(
          Effect.catchCause((cause) =>
            Effect.logError(
              `the job maintenance gate failed to read the deployment state: ${Cause.pretty(cause)}`,
            ),
          ),
        );
        const interval = config.pollInterval ?? DEFAULT_POLL_INTERVAL;
        yield* guarded;
        yield* Effect.forkScoped(
          Effect.sleep(interval).pipe(Effect.andThen(guarded), Effect.forever),
        );
      }),
    ),
} as const;
