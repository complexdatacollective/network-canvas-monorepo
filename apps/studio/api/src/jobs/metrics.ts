import { Cause, Duration, Effect, Layer, Metric, Schedule } from 'effect';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import type { MaintenanceDatabase } from '../db/client.ts';
import { resolvedQueues } from './queues.ts';
import { JOB_STATES } from './schema.ts';
import { JobWorker } from './worker.ts';

export const jobQueueDepth = Metric.gauge('studio_jobs_queue_depth', {
  description: 'jobs on a queue in a given state, as of the last metrics pass',
});

const DEFAULT_WARNING_QUEUE_SIZE = 10_000;

const DEFAULTS = {
  metricsInterval: Duration.seconds(60),
  warningQueueSize: DEFAULT_WARNING_QUEUE_SIZE,
} as const;

export type JobQueueMetricsConfig = {
  readonly metricsInterval?: Duration.Input | undefined;
  readonly warningQueueSize?: number | undefined;
};

export type BacklogWarnings = Set<JobQueueName>;

const depthKey = (queue: string, state: string): string => `${queue}/${state}`;

/** Every declared (queue, state) pair is written, so a drained queue's gauge does not keep its last value. */
export const recordQueueDepths = Effect.fn('JobQueueMetrics.record')(
  function* (options: {
    readonly warned: BacklogWarnings;
    readonly warningQueueSize: number;
  }) {
    const worker = yield* JobWorker;
    const depths = yield* worker.queueDepths;
    const counts = new Map(
      depths.map((depth) => [depthKey(depth.queue, depth.state), depth.count]),
    );

    for (const declaration of resolvedQueues) {
      for (const state of JOB_STATES) {
        const count = counts.get(depthKey(declaration.name, state)) ?? 0;
        yield* Metric.update(
          Metric.withAttributes(jobQueueDepth, {
            queue: declaration.name,
            state,
          }),
          count,
        );
      }

      const waiting = counts.get(depthKey(declaration.name, 'created')) ?? 0;
      const threshold =
        declaration.warningQueueSize ?? options.warningQueueSize;
      if (waiting > threshold) {
        if (options.warned.has(declaration.name)) continue;
        options.warned.add(declaration.name);
        yield* Effect.logWarning(
          `large queue backlog: ${declaration.name} holds ${waiting} jobs waiting to run, over its warning size of ${threshold}`,
        );
        continue;
      }
      options.warned.delete(declaration.name);
    }
  },
);

export const JobQueueMetrics = {
  layer: (
    config: JobQueueMetricsConfig = {},
  ): Layer.Layer<never, never, JobWorker | MaintenanceDatabase> =>
    Layer.effectDiscard(
      Effect.gen(function* () {
        const options = {
          warned: new Set<JobQueueName>(),
          warningQueueSize:
            config.warningQueueSize ?? DEFAULTS.warningQueueSize,
        };
        yield* Effect.forkScoped(
          recordQueueDepths(options).pipe(
            Effect.catchCause((cause) =>
              Effect.logError(
                `the job metrics pass failed: ${Cause.pretty(cause)}`,
              ),
            ),
            Effect.repeat(
              Schedule.spaced(
                config.metricsInterval ?? DEFAULTS.metricsInterval,
              ),
            ),
          ),
        );
      }),
    ),
} as const;
