import { Duration, Effect, Layer, MutableRef, Option } from 'effect';

import { MaintenanceTriggers } from '../http/middleware/maintenance.ts';
import { JobWorker } from './worker.ts';

const DEFAULT_POLL_INTERVAL = Duration.seconds(1);

export type JobMaintenanceGateConfig = {
  readonly pollInterval?: Duration.Input | undefined;
};

type Applied = { readonly fetching: boolean; readonly detail: string | null };

/**
 * The worker claims jobs only while the API would be open: one rule,
 * `MaintenanceTriggers.closure`, governs both processes. So a worker still
 * running when `migrate` starts stops claiming while the migration lock is
 * held, and stays stopped afterwards on a schema that is not its build's.
 */
export const JobMaintenanceGate = {
  layer: (
    config: JobMaintenanceGateConfig = {},
  ): Layer.Layer<never, never, JobWorker | MaintenanceTriggers> =>
    Layer.effectDiscard(
      Effect.gen(function* () {
        const worker = yield* JobWorker;
        const triggers = yield* MaintenanceTriggers;
        // `null` until the first tick, so the first answer is always applied: that is
        // what opens a worker built with `startPaused`.
        const applied = MutableRef.make<Applied | null>(null);

        const tick = Effect.gen(function* () {
          const closure = yield* triggers.closure;
          const fetching = Option.isNone(closure);
          const detail = Option.match(closure, {
            onNone: () => null,
            onSome: (closed) => closed.detail,
          });
          const previous = MutableRef.get(applied);
          if (previous?.fetching === fetching && previous.detail === detail) {
            return;
          }
          MutableRef.set(applied, { fetching, detail });
          if (previous?.fetching !== fetching) {
            yield* worker.setFetching(fetching);
          }
          if (Option.isSome(closure)) {
            yield* Effect.logWarning(
              'the deployment is closed: the job worker has stopped claiming jobs on every queue',
            ).pipe(Effect.annotateLogs({ trigger: closure.value.trigger }));
            return;
          }
          if (previous !== null) {
            yield* Effect.logInfo(
              'the deployment is open again: the job worker is claiming jobs again',
            );
          }
        });

        const guarded = tick.pipe(
          Effect.catchCause((cause) =>
            Effect.logError(
              'the job maintenance gate failed to read whether the deployment is open',
              cause,
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
