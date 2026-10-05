import { assert, layer } from '@effect/vitest';
import { Cause, DateTime, Effect, Exit } from 'effect';
import { describe } from 'vitest';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { resolvedQueue } from '../queues.ts';
import {
  asOwner,
  clearQueue,
  enqueue,
  layerJobs,
  layerQueueHarness,
  QueueHarness,
} from './support.ts';

const db = await reachableDb();

const QUEUE = 'invitation-delivery';
const DELIVERED_TO = '77777777-7777-4777-8777-777777777777';

const DEFERRED_BY_SECONDS = 3600;

describe.skipIf(!db)('the enqueue', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (suite) => {
    suite.effect(
      'holds a deferred job for its whole retention after the instant it may run',
      () =>
        Effect.gen(function* () {
          yield* clearQueue;
          const { schema } = yield* QueueHarness;
          const startAfter = DateTime.addDuration(
            yield* DateTime.now,
            `${DEFERRED_BY_SECONDS} seconds`,
          );

          yield* enqueue(QUEUE, { deliveryId: DELIVERED_TO }, { startAfter });

          const rows = yield* asOwner(
            Effect.flatMap(
              MaintenanceDatabase,
              ({ sql }) => sql<{
                deferred_by_seconds: number;
                retention_seconds: number;
              }>`
                SELECT extract(epoch FROM (run_at - created_at))::int
                         AS deferred_by_seconds,
                       extract(epoch FROM (keep_until - run_at))::int
                         AS retention_seconds
                  FROM ${sql(schema)}.jobs
                 WHERE queue = ${QUEUE}`,
            ),
          );

          assert.lengthOf(rows, 1);
          const row = rows[0]!;
          assert.isAbove(row.deferred_by_seconds, DEFERRED_BY_SECONDS - 60);
          assert.strictEqual(
            row.retention_seconds,
            resolvedQueue(QUEUE).retentionSeconds,
          );
        }).pipe(Effect.provide(layerJobs)),
      { timeout: 30_000 },
    );

    suite.effect('dies rather than enqueue onto a queue nothing declares', () =>
      Effect.gen(function* () {
        yield* clearQueue;
        const outcome = yield* Effect.exit(
          enqueue('invitation-delivery-typo' as typeof QUEUE, {
            deliveryId: DELIVERED_TO,
          }),
        );
        assert.isTrue(Exit.isFailure(outcome));
        assert.isTrue(Exit.isFailure(outcome) && Cause.hasDies(outcome.cause));
      }).pipe(Effect.provide(layerJobs)),
    );
  });
});
