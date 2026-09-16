import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import { Duration, Effect, Layer, Metric } from 'effect';
import { TestClock } from 'effect/testing';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { collectLogs } from '../../../platform/__tests__/support/logs.ts';
import { Database, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import {
  jobQueueDepth,
  JobQueueMetrics,
  recordQueueDepths,
  type BacklogWarnings,
} from '../metrics.ts';
import { resolvedQueues } from '../queues.ts';
import { JOB_STATES } from '../schema.ts';
import { JobWorker, type JobOutcome } from '../worker.ts';
import {
  asApp,
  asOwner,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
} from './support.ts';

// What an operator sees of the queue: a gauge per queue and state that
// follows the table both ways, and pg-boss's backlog warning on the crossing
// rather than on every tick.

const db = await reachableDb();

describe.skipIf(!db)('the queue’s metrics', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const clear = Effect.gen(function* () {
      const { schema } = yield* QueueHarness;
      yield* asOwner(
        Effect.flatMap(Database, ({ sql }) =>
          sql.unsafe(`DELETE FROM ${schema}.jobs`),
        ),
      );
    });

    const jobsLayer = Layer.unwrap(
      Effect.map(QueueHarness, (harness) =>
        Jobs.layer({ schema: harness.schema }),
      ),
    );

    const enqueueDelivery = Effect.flatMap(Jobs, (jobs) =>
      asApp(
        withTransaction(
          jobs.enqueue('invitation-delivery', { deliveryId: randomUUID() }),
        ),
      ),
    );

    /** The gauge series for one queue and state, as a plain number. */
    const depthOf = (queue: string, state: string) =>
      Effect.map(
        Metric.value(Metric.withAttributes(jobQueueDepth, { queue, state })),
        (gauge) => gauge.value,
      );

    /** A pass with the warning state a case owns, so a case is one crossing. */
    const pass = (options: {
      readonly warned: BacklogWarnings;
      readonly warningQueueSize: number;
    }) => recordQueueDepths(options).pipe(Effect.provide(layerWorker()));

    /** A fresh registry per case: a gauge is otherwise process-wide. */
    const withRegistry = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provideService(effect, Metric.MetricRegistry, new Map());

    it.effect('sets a gauge for every declared queue and state', () =>
      withRegistry(
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueDelivery;
          yield* enqueueDelivery;
          yield* enqueueDelivery;

          // One of the three run to completion, so the pass has two states of
          // one queue to report rather than one.
          yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed<JobOutcome>('completed'),
            );
            const step = yield* worker.drainOnce('invitation-delivery');
            assert.strictEqual(step._tag, 'settled');
          }).pipe(Effect.provide(layerWorker()));

          yield* pass({
            warned: new Set<JobQueueName>(),
            warningQueueSize: 10,
          });

          // Read off the registry before anything else asks for a series:
          // reading a gauge registers it, and an unset gauge answers 0, so
          // "the queue with no rows reports 0" is only a real assertion when
          // it is made of the series the pass itself created.
          const series = (yield* Metric.snapshot).filter(
            (snapshot) => snapshot.id === 'studio_jobs_queue_depth',
          );
          assert.deepStrictEqual(
            series
              .map(
                ({ attributes }) => `${attributes?.queue}/${attributes?.state}`,
              )
              .toSorted(),
            resolvedQueues
              .flatMap(({ name }) =>
                JOB_STATES.map((state) => `${name}/${state}`),
              )
              .toSorted(),
          );

          assert.strictEqual(
            yield* depthOf('invitation-delivery', 'created'),
            2,
          );
          assert.strictEqual(
            yield* depthOf('invitation-delivery', 'completed'),
            1,
          );
          assert.strictEqual(
            yield* depthOf('invitation-delivery', 'active'),
            0,
          );
          // A queue with no rows at all still reports, which is what lets a
          // dashboard tell "nothing queued" from "no such series".
          assert.strictEqual(yield* depthOf('sign-in-email', 'created'), 0);
        }),
      ).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('follows the table back down when a queue drains', () =>
      withRegistry(
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueDelivery;
          yield* enqueueDelivery;
          yield* pass({
            warned: new Set<JobQueueName>(),
            warningQueueSize: 10,
          });
          assert.strictEqual(
            yield* depthOf('invitation-delivery', 'created'),
            2,
          );

          yield* clear;
          yield* pass({
            warned: new Set<JobQueueName>(),
            warningQueueSize: 10,
          });
          assert.strictEqual(
            yield* depthOf('invitation-delivery', 'created'),
            0,
          );
        }),
      ).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('warns once per crossing of the warning queue size', () => {
      const logs = collectLogs();
      return withRegistry(
        Effect.gen(function* () {
          yield* clear;
          const warned: BacklogWarnings = new Set();

          // At the threshold: pg-boss compares strictly, and so does this.
          yield* enqueueDelivery;
          yield* pass({ warned, warningQueueSize: 1 });
          assert.deepStrictEqual(logs.messages, []);

          // Over it: one line.
          yield* enqueueDelivery;
          yield* pass({ warned, warningQueueSize: 1 });
          assert.strictEqual(logs.messages.length, 1);
          assert.include(logs.messages[0]!, 'large queue backlog');
          assert.include(logs.messages[0]!, 'invitation-delivery holds 2 jobs');
          assert.include(logs.messages[0]!, 'warning size of 1');

          // Still over it on the next pass, and still one line: the warning is
          // the crossing, not the condition.
          yield* pass({ warned, warningQueueSize: 1 });
          assert.strictEqual(logs.messages.length, 1);

          // Back under, then over again: a second crossing, a second line.
          yield* clear;
          yield* pass({ warned, warningQueueSize: 1 });
          assert.strictEqual(logs.messages.length, 1);
          yield* enqueueDelivery;
          yield* enqueueDelivery;
          yield* pass({ warned, warningQueueSize: 1 });
          assert.strictEqual(logs.messages.length, 2);
        }),
      ).pipe(Effect.provide(jobsLayer), Effect.provide(logs.layer));
    });

    it.effect('counts only the jobs waiting to run', () => {
      const logs = collectLogs();
      return withRegistry(
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueDelivery;
          yield* enqueueDelivery;

          // Two jobs, one of them finished: pg-boss's `queuedCount` is the
          // rows below `active`, so a completed row must not count towards a
          // backlog warning.
          yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed<JobOutcome>('completed'),
            );
            yield* worker.drainOnce('invitation-delivery');
          }).pipe(Effect.provide(layerWorker()));

          yield* pass({ warned: new Set<JobQueueName>(), warningQueueSize: 1 });
          assert.deepStrictEqual(logs.messages, []);
          assert.strictEqual(
            yield* depthOf('invitation-delivery', 'created'),
            1,
          );
        }),
      ).pipe(Effect.provide(jobsLayer), Effect.provide(logs.layer));
    });

    it.effect('reads the depths on a fiber of its own', () =>
      withRegistry(
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueDelivery;
          yield* enqueueDelivery;

          yield* Effect.gen(function* () {
            // The layer's first pass is immediate and runs against a real
            // database, so it is awaited in live time — the hour-long interval
            // means nothing else can have set this gauge.
            let depth = 0;
            for (let attempt = 0; attempt < 100 && depth !== 2; attempt++) {
              yield* TestClock.withLive(Effect.sleep(Duration.millis(20)));
              depth = yield* depthOf('invitation-delivery', 'created');
            }
            assert.strictEqual(depth, 2);
          }).pipe(
            Effect.provide(
              JobQueueMetrics.layer({ metricsInterval: Duration.hours(1) }),
            ),
            Effect.provide(layerWorker()),
          );
        }),
      ).pipe(Effect.provide(jobsLayer)),
    );
  });
});
