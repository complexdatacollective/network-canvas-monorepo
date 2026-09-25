import { Cause, Duration, Effect, Layer, Metric, Schedule } from 'effect';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import type { MaintenanceDatabase } from '../db/client.ts';
import { resolvedQueues } from './queues.ts';
import { JOB_STATES } from './schema.ts';
import { JobWorker } from './worker.ts';

// What an operator can see of the queue while it runs, and the one warning
// pg-boss raises about it. Both come from the same pass over
// `JobWorker.queueDepths`, on a fiber of this layer's own — nothing in the
// claim path pays for a metric, and a queue nothing enqueues to still reports
// a depth, because the pass reads every declared queue rather than only the
// ones with rows.
//
// The pass is also what makes the worker `ready` (worker.ts sets its started
// flag when `queueDepths` answers), so a deployment that runs this layer has a
// readiness check that means "the worker has reached its tables", not merely
// "the process is up". See readiness.ts.

/**
 * One gauge, two attributes: `studio_jobs_queue_depth{queue,state}`. A gauge
 * rather than a counter because a depth is an instantaneous reading that goes
 * both ways, and one metric with attributes rather than a metric per queue
 * because that is what lets a dashboard sum or split without knowing the
 * queue names (Metric.ts, `withAttributes` — each combination is its own
 * series).
 */
export const jobQueueDepth = Metric.gauge('studio_jobs_queue_depth', {
  description: 'jobs on a queue in a given state, as of the last metrics pass',
});

/**
 * pg-boss's own default (12.31.1 `dist/boss.js`, `WARNINGS.LARGE_QUEUE.size`),
 * used for a queue whose declaration names no `warningQueueSize` — which is
 * every one of Studio's today. pg-boss reads it off its constructor config the
 * same way, so this is a layer-level default overridden per queue, not a
 * second knob.
 */
const DEFAULT_WARNING_QUEUE_SIZE = 10_000;

const DEFAULTS = {
  metricsInterval: Duration.seconds(60),
  warningQueueSize: DEFAULT_WARNING_QUEUE_SIZE,
} as const;

export type JobQueueMetricsConfig = {
  /** How often the depths are read; 60 s, as pg-boss's monitor runs. */
  readonly metricsInterval?: Duration.Input | undefined;
  /** The threshold for a queue that declares none. */
  readonly warningQueueSize?: number | undefined;
};

/**
 * The queues whose backlog has already been reported. pg-boss emits its
 * `queue_backlog` warning on *every* monitoring pass while the condition
 * holds, which is a warning a minute until someone acts; the threshold
 * semantics here are pg-boss's exactly — strictly more than the queue's
 * `warningQueueSize`, counting the jobs waiting to run (pg-boss's
 * `queuedCount` is `state < active`, which is this queue's `created`) — but
 * the logging is edge-triggered: one line when a queue crosses, and nothing
 * more until it has fallen back to or below the threshold. Ruling 1 of the
 * brief ("a logged warning from the metrics fiber"), and the difference is
 * recorded here because it is the one place this queue is quieter than
 * pg-boss.
 */
export type BacklogWarnings = Set<JobQueueName>;

/** `queue` and `state` are both identifiers; neither contains a slash. */
const depthKey = (queue: string, state: string): string => `${queue}/${state}`;

/**
 * One pass: read every queue's depth, set the gauges, and warn about a queue
 * that has just crossed its warning size. Exported because the layer below
 * only repeats it — a suite drives the pass directly, the way it drives
 * `JobWorker.drainOnce` rather than waiting on a poll fiber.
 *
 * Every declared (queue, state) pair is written, not only the pairs with
 * rows: a gauge left at its last value when a queue drains would report a
 * backlog that is no longer there.
 */
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
  /**
   * The metrics fiber. A failed pass is logged and the next one runs — a
   * database the worker cannot reach is the readiness check's to report, and
   * a metrics fiber that died on the first one would leave every gauge frozen
   * at its last value for the life of the process.
   */
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
