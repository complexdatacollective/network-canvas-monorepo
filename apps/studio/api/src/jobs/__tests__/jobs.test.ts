import { assert, layer } from '@effect/vitest';
import { Cron, DateTime, Effect, Option, type Tracer } from 'effect';
import { TestClock } from 'effect/testing';
import { describe } from 'vitest';

import { observe } from '../../__tests__/support/observe.ts';
import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { MaintenanceScope } from '../../db/tenant.ts';
import { Jobs } from '../jobs.ts';
import { JobWorker } from '../worker.ts';
import {
  asApp,
  asOwner,
  clearQueue,
  DELIVERY_ID,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
} from './support.ts';

const db = await reachableDb();

const QUEUE = 'invitation-delivery';

const correlations = Effect.gen(function* () {
  const { schema } = yield* QueueHarness;
  return yield* asOwner(
    Effect.flatMap(
      MaintenanceDatabase,
      ({ sql }) => sql<{ queue: string; correlation: unknown }>`
        SELECT queue, correlation FROM ${sql(schema)}.jobs
         ORDER BY created_at`,
    ),
  );
});

const handleSpans = (spans: readonly Tracer.NativeSpan[]) =>
  spans.filter((span) => span.name === 'JobWorker.handle');

const parentOf = (span: Tracer.NativeSpan | undefined) =>
  span === undefined ? Option.none() : span.parent;

describe.skipIf(!db)('a job’s trace', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (suite) => {
    suite.effect(
      'carries the enqueuing span’s traceparent, and its handler continues that trace',
      () => {
        const observed = observe();
        return Effect.gen(function* () {
          yield* clearQueue;
          const worker = yield* JobWorker;
          const jobs = yield* Jobs;

          const enqueuing = yield* asApp(
            MaintenanceScope.open(
              Effect.flatMap(
                jobs.enqueue(QUEUE, { deliveryId: DELIVERY_ID }),
                () => Effect.currentSpan,
              ).pipe(Effect.withSpan('request')),
            ),
          );

          const [row] = yield* correlations;
          assert.deepStrictEqual(row?.correlation, {
            traceparent: `00-${enqueuing.traceId}-${enqueuing.spanId}-01`,
          });

          yield* worker.work(QUEUE, () => Effect.succeed('completed'));
          const step = yield* worker.drainOnce(QUEUE);
          assert.strictEqual(step._tag, 'settled');

          const handled = handleSpans(observed.spans);
          assert.lengthOf(handled, 1);
          const span = handled[0];
          assert.strictEqual(span?.traceId, enqueuing.traceId);
          const parent = parentOf(span);
          assert.isTrue(Option.isSome(parent));
          if (Option.isSome(parent)) {
            assert.strictEqual(parent.value.traceId, enqueuing.traceId);
            assert.strictEqual(parent.value.spanId, enqueuing.spanId);
            assert.isTrue(parent.value.sampled);
          }
        }).pipe(Effect.provide(layerWorker()), Effect.provide(observed.layer));
      },
    );

    suite.effect(
      'carries nothing when enqueued uncorrelated, and its handler stays in the worker’s trace',
      () => {
        const observed = observe();
        return Effect.gen(function* () {
          yield* clearQueue;
          const worker = yield* JobWorker;
          const jobs = yield* Jobs;

          yield* asApp(
            MaintenanceScope.open(
              jobs.enqueue(
                QUEUE,
                { deliveryId: DELIVERY_ID },
                { correlate: false },
              ),
            ).pipe(Effect.withSpan('request')),
          );
          const [row] = yield* correlations;
          assert.isNull(row?.correlation);

          yield* worker.work(QUEUE, () => Effect.succeed('completed'));
          yield* worker.drainOnce(QUEUE);

          const drain = observed.spans.find(
            (span) => span.name === 'JobWorker.drainOnce',
          );
          const [span] = handleSpans(observed.spans);
          assert.isDefined(drain);
          assert.strictEqual(span?.traceId, drain?.traceId);
          const parent = parentOf(span);
          assert.isTrue(
            Option.isSome(parent) && parent.value.spanId === drain?.spanId,
          );
        }).pipe(Effect.provide(layerWorker()), Effect.provide(observed.layer));
      },
    );

    suite.effect(
      'carries nothing on a job a schedule enqueues, though the tick is traced',
      () => {
        const observed = observe();
        return Effect.gen(function* () {
          yield* clearQueue;
          const worker = yield* JobWorker;
          const cron = '0 * * * *';
          yield* worker.schedule(
            'protocol-store-gc',
            cron,
            'protocol-store-gc',
            {},
          );
          const boundary = Cron.next(
            Cron.parseUnsafe(cron, 'UTC'),
            DateTime.toDate(yield* DateTime.now),
          );
          yield* TestClock.setTime(boundary.getTime());
          assert.isTrue(yield* worker.tickSchedules);

          assert.isTrue(
            observed.spans.some(
              (span) => span.name === 'JobWorker.tickSchedules',
            ),
          );
          assert.deepStrictEqual(yield* correlations, [
            { queue: 'protocol-store-gc', correlation: null },
          ]);
        }).pipe(Effect.provide(layerWorker()), Effect.provide(observed.layer));
      },
    );
  });
});
