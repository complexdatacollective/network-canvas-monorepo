import { assert, describe, layer } from '@effect/vitest';
import { Effect, Option } from 'effect';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { JobWorker } from '../worker.ts';
import {
  asOwner,
  awaitJobState,
  clearQueue,
  DELIVERY_ID,
  enqueueDelivery,
  layerNotifiedWorker,
  layerQueueHarness,
  NOTIFY_BUDGET,
  NOTIFY_SETTLE,
  QueueHarness,
  readJobs,
} from './support.ts';

const db = await reachableDb();

describe.skipIf(!db)('waking a worker with LISTEN/NOTIFY', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const clear = clearQueue;

      const awaitCompleted = awaitJobState(
        'invitation-delivery',
        'completed',
        NOTIFY_BUDGET,
      );

      const raceTheBudget = (listen: boolean) =>
        Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('invitation-delivery', () =>
            Effect.succeed('completed' as const),
          );
          yield* Effect.sleep(NOTIFY_SETTLE);

          yield* enqueueDelivery();

          return yield* awaitCompleted;
        }).pipe(Effect.provide(layerNotifiedWorker(listen)));

      it.effect('drains a job the moment its transaction commits', () =>
        Effect.gen(function* () {
          yield* clear;
          const settled = yield* raceTheBudget(true);
          assert.isTrue(
            Option.isSome(settled),
            'the notified worker did not settle the job within the budget',
          );
        }),
      );

      it.effect('leaves the same job waiting when nothing is listening', () =>
        Effect.gen(function* () {
          yield* clear;
          const settled = yield* raceTheBudget(false);
          assert.isTrue(
            Option.isNone(settled),
            'the job settled without a notification, so the budget proves nothing',
          );
          const [row] = yield* readJobs('invitation-delivery');
          assert.strictEqual(row?.state, 'created');
        }),
      );

      it.effect(
        'wakes on a row any writer makes created, not just enqueue',
        () =>
          Effect.gen(function* () {
            yield* clear;
            const { schema } = yield* QueueHarness;
            const asOwnerSql = (statement: string) =>
              asOwner(
                Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
                  sql.unsafe(statement),
                ),
              );

            yield* Effect.gen(function* () {
              const worker = yield* JobWorker;
              yield* worker.work('invitation-delivery', () =>
                Effect.succeed('completed' as const),
              );
              yield* asOwnerSql(
                `INSERT INTO ${schema}.jobs
                 (queue, payload, state, policy, attempts, retry_limit,
                  expire_in_seconds, run_at, keep_until, created_at)
               VALUES ('invitation-delivery',
                       '{"deliveryId":"${DELIVERY_ID}"}'::jsonb,
                       'failed', 'standard', 0, 0, 60,
                       now(), now() + interval '1 day', now())`,
              );
              yield* Effect.sleep(NOTIFY_SETTLE);

              yield* asOwnerSql(
                `UPDATE ${schema}.jobs SET state = 'created', attempts = 0`,
              );
              const settled = yield* awaitCompleted;
              assert.isTrue(
                Option.isSome(settled),
                'an UPDATE to created did not wake the worker',
              );
            }).pipe(Effect.provide(layerNotifiedWorker(true)));
          }),
      );
    },
  );
});
