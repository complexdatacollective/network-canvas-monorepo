import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import { Duration, Effect, Layer, Metric } from 'effect';
import { TestClock } from 'effect/testing';

import type { JobQueueName } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { collectLogs } from '../../platform/__tests__/support/logs.ts';
import type { Episode } from '../../platform/operator-alerts.ts';
import {
  jobQueueDepth,
  JobQueueMetrics,
  noteQueueBacklog,
  recordQueueDepths,
  type BacklogWarnings,
} from '../metrics.ts';
import { resolvedQueues } from '../queues.ts';
import { JOB_STATES } from '../schema.ts';
import type { JobOutcome } from '../worker.ts';
import {
  clearQueue,
  drainWith,
  enqueueDelivery,
  layerJobs,
  layerQueueHarness,
  layerWorker,
} from './support.ts';

const db = await reachableDb();

layer(Layer.empty)('the queue backlog alert', (it) => {
  it.effect(
    'logs once per queue when more than 100 jobs wait for ten minutes, and once when it clears',
    () => {
      const logs = collectLogs();
      return Effect.gen(function* () {
        const episodes = new Map<JobQueueName, Episode>();
        const note = (queue: JobQueueName, waiting: number) =>
          noteQueueBacklog(episodes, queue, waiting);
        const records = () =>
          logs.records.map(({ level, annotations }) => ({
            level,
            alert: annotations.alert,
            queue: annotations.queue,
            waiting: annotations.waiting,
          }));

        yield* note('invitation-delivery', 150);
        yield* note('sign-in-email', 101);
        yield* TestClock.adjust(Duration.minutes(9));
        yield* note('invitation-delivery', 150);
        yield* note('sign-in-email', 100);
        assert.deepStrictEqual(records(), []);

        yield* TestClock.adjust(Duration.minutes(1));
        yield* note('invitation-delivery', 180);
        yield* note('sign-in-email', 101);
        yield* TestClock.adjust(Duration.minutes(5));
        yield* note('invitation-delivery', 400);
        assert.deepStrictEqual(records(), [
          {
            level: 'Error',
            alert: 'queue_backlog',
            queue: 'invitation-delivery',
            waiting: 180,
          },
        ]);

        yield* note('invitation-delivery', 12);
        yield* note('invitation-delivery', 0);
        assert.deepStrictEqual(records().slice(1), [
          {
            level: 'Info',
            alert: undefined,
            queue: 'invitation-delivery',
            waiting: 12,
          },
        ]);
      }).pipe(Effect.provide(logs.layer));
    },
  );
});

describe.skipIf(!db)('the queue’s metrics', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const clear = clearQueue;
    const jobsLayer = layerJobs;

    const enqueueOne = Effect.suspend(() => enqueueDelivery(randomUUID()));

    const depthOf = (queue: string, state: string) =>
      Effect.map(
        Metric.value(Metric.withAttributes(jobQueueDepth, { queue, state })),
        (gauge) => gauge.value,
      );

    const pass = (options: {
      readonly warned: BacklogWarnings;
      readonly warningQueueSize: number;
    }) =>
      recordQueueDepths({ ...options, backlog: new Map() }).pipe(
        Effect.provide(layerWorker()),
      );

    const withRegistry = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provideService(effect, Metric.MetricRegistry, new Map());

    it.effect('sets a gauge for every declared queue and state', () =>
      withRegistry(
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueOne;
          yield* enqueueOne;
          yield* enqueueOne;

          const step = yield* drainWith('invitation-delivery', () =>
            Effect.succeed<JobOutcome>('completed'),
          );
          assert.strictEqual(step._tag, 'settled');

          yield* pass({
            warned: new Set<JobQueueName>(),
            warningQueueSize: 10,
          });

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
          assert.strictEqual(yield* depthOf('sign-in-email', 'created'), 0);
        }),
      ).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('follows the table back down when a queue drains', () =>
      withRegistry(
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueOne;
          yield* enqueueOne;
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

          yield* enqueueOne;
          yield* pass({ warned, warningQueueSize: 1 });
          assert.deepStrictEqual(logs.messages, []);

          yield* enqueueOne;
          yield* pass({ warned, warningQueueSize: 1 });
          assert.strictEqual(logs.messages.length, 1);
          assert.include(logs.messages[0]!, 'large queue backlog');
          assert.deepStrictEqual(logs.records[0]?.annotations, {
            queue: 'invitation-delivery',
            waiting: 2,
            warning_size: 1,
          });

          yield* pass({ warned, warningQueueSize: 1 });
          assert.strictEqual(logs.messages.length, 1);

          yield* clear;
          yield* pass({ warned, warningQueueSize: 1 });
          assert.strictEqual(logs.messages.length, 1);
          yield* enqueueOne;
          yield* enqueueOne;
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
          yield* enqueueOne;
          yield* enqueueOne;

          yield* drainWith('invitation-delivery', () =>
            Effect.succeed<JobOutcome>('completed'),
          );

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
          yield* enqueueOne;
          yield* enqueueOne;

          yield* Effect.gen(function* () {
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
