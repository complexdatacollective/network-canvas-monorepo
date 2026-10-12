import { assert, describe, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { readiness } from '../../http/health.ts';
import { jobsCheck } from '../readiness.ts';
import { JobWorker } from '../worker.ts';
import { layerQueueHarness, layerWorker, QueueHarness } from './support.ts';

const db = await reachableDb();

describe.skipIf(!db)('the jobs readiness check', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    it.effect('is failing until the worker has read its queues', () =>
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const { maintenance } = yield* QueueHarness;

          const before = yield* readiness({
            jobs: jobsCheck(worker, maintenance),
          });
          assert.strictEqual(before.status, 'failing');
          assert.include(before.checks.jobs!, 'has not read its queues yet');

          yield* worker.queueDepths;

          const after = yield* readiness({
            jobs: jobsCheck(worker, maintenance),
          });
          assert.deepStrictEqual(after, {
            status: 'ok',
            checks: { jobs: 'ok' },
          });
        }).pipe(Effect.provide(layerWorker()));
      }),
    );

    it.effect('is ready on the worker’s own first answered claim', () =>
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const { maintenance } = yield* QueueHarness;
          assert.isFalse(yield* worker.ready);

          const step = yield* worker.drainOnce('invitation-delivery');
          assert.strictEqual(step._tag, 'idle');
          assert.isTrue(yield* worker.ready);

          const verdict = yield* readiness({
            jobs: jobsCheck(worker, maintenance),
          });
          assert.deepStrictEqual(verdict, {
            status: 'ok',
            checks: { jobs: 'ok' },
          });
        }).pipe(Effect.provide(layerWorker({ background: false })));
      }),
    );

    it.effect('is ok on a worker that was never asked to listen', () =>
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const { maintenance } = yield* QueueHarness;
          yield* worker.queueDepths;

          const verdict = yield* readiness({
            jobs: jobsCheck(worker, maintenance),
          });
          assert.deepStrictEqual(verdict, {
            status: 'ok',
            checks: { jobs: 'ok' },
          });
        }).pipe(
          Effect.provide(layerWorker({ background: true, listen: false })),
        );
      }),
    );

    it.effect('is failing when the role cannot read the queue tables', () =>
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const { app, maintenance } = yield* QueueHarness;
          yield* worker.queueDepths;

          const result = yield* readiness({
            jobs: jobsCheck(worker, app),
          });
          assert.strictEqual(result.status, 'failing');
          assert.include(result.checks.jobs!, 'permission denied');

          const healthy = yield* readiness({
            jobs: jobsCheck(worker, maintenance),
          });
          assert.strictEqual(healthy.status, 'ok');
        }).pipe(Effect.provide(layerWorker()));
      }),
    );
  });
});
