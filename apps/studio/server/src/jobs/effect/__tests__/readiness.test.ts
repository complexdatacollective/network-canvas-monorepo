import { assert, describe, layer } from '@effect/vitest';
import { Effect } from 'effect';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { readiness } from '../../../http/health.ts';
import { jobsCheck } from '../readiness.ts';
import { JobWorker } from '../worker.ts';
import { layerQueueHarness, layerWorker, QueueHarness } from './support.ts';

// The `jobs` entry of the worker's readiness probe, read through the same
// `readiness` the route serves — so what these cases assert is the status and
// the reason a deployment actually sees, not the check's own error value.

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

          // What the metrics fiber does every minute (metrics.ts); a probe
          // must not be the thing that makes the worker ready, which is why
          // the check reads `ready` before it reads the tables.
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

    it.effect('is failing when the role cannot read the queue tables', () =>
      Effect.gen(function* () {
        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const { app, maintenance } = yield* QueueHarness;
          yield* worker.queueDepths;

          // Ready, and the read still refused: the application role may insert
          // a job and read back its id, nothing more (schema.ts's grants). A
          // worker mounted on the wrong pool reports it here rather than on
          // its first claim.
          const result = yield* readiness({
            jobs: jobsCheck(worker, app),
          });
          assert.strictEqual(result.status, 'failing');
          assert.include(result.checks.jobs!, 'permission denied');

          // And the same worker on the role it works jobs as is ready, so the
          // failure above is the role's and not the worker's.
          const healthy = yield* readiness({
            jobs: jobsCheck(worker, maintenance),
          });
          assert.strictEqual(healthy.status, 'ok');
        }).pipe(Effect.provide(layerWorker()));
      }),
    );
  });
});
