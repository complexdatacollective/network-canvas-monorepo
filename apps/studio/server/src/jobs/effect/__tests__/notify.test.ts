import { assert, describe, layer } from '@effect/vitest';
import { Duration, Effect, Option } from 'effect';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { Database, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import { JobWorker } from '../worker.ts';
import {
  asApp,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
} from './support.ts';

// The one case in this directory that runs in *real* time: what the schema's
// `NOTIFY` trigger buys is measured in milliseconds, and virtual time would
// make any latency claim vacuous — a `TestClock.adjust` past the poll interval
// proves only that polling works.
//
// `excludeTestServices` is what takes the test clock away: the layer helper
// merges `TestEnv` into every suite unless it is told not to, and this suite
// wants the wall clock for `Effect.sleep` and for the worker's own fibers.
//
// The oracle is a pair. With the listener on, a job enqueued after the worker
// has settled reaches `completed` inside 500 ms while the poll interval is an
// hour away; with the listener off — and nothing else changed — the same job is
// still `created` when the same 500 ms are up. Without the second half the
// first would pass on any implementation that polled fast enough.

const db = await reachableDb();

const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';

/** An hour, so nothing but a notification can explain a prompt drain. */
const POLL_INTERVAL = Duration.hours(1);

/** What the notified worker must beat, and the unnotified one must not. */
const BUDGET = Duration.millis(500);

/**
 * Long enough for the worker's first poll pass — the wake latch starts open, so
 * a worker drains once at boot — to have happened and left the queue idle
 * before anything is enqueued. Without it the positive half could be a boot
 * drain rather than a notification, and the negative half could lose a race.
 */
const SETTLE = Duration.millis(150);

describe.skipIf(!db)('waking a worker with LISTEN/NOTIFY', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const clear = Effect.gen(function* () {
        const { schema } = yield* QueueHarness;
        yield* Effect.flatMap(QueueHarness, (harness) =>
          Effect.provideService(
            Effect.flatMap(Database, ({ sql }) =>
              sql.unsafe(`DELETE FROM ${schema}.jobs`),
            ),
            Database,
            harness.owner,
          ),
        );
      });

      /** Polls the row rather than the handler: the case is about the state. */
      const awaitCompleted = Effect.gen(function* () {
        let settled = false;
        while (!settled) {
          const rows = yield* readJobs('invitation-delivery');
          settled = rows[0]?.state === 'completed';
          if (!settled) yield* Effect.sleep(Duration.millis(10));
        }
      }).pipe(Effect.timeoutOption(BUDGET));

      /**
       * Boots a background worker with an hour-long poll interval, lets it
       * settle, enqueues one job, and answers whether the job reached
       * `completed` inside the budget.
       */
      const raceTheBudget = (listen: boolean) =>
        Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('invitation-delivery', () =>
            Effect.succeed('completed' as const),
          );
          yield* Effect.sleep(SETTLE);

          yield* Effect.flatMap(Jobs, (jobs) =>
            asApp(
              withTransaction(
                jobs.enqueue('invitation-delivery', {
                  deliveryId: DELIVERY_ID,
                }),
              ),
            ),
          );

          return yield* awaitCompleted;
        }).pipe(
          Effect.provide(
            layerWorker({
              background: true,
              pollInterval: POLL_INTERVAL,
              listen,
            }),
          ),
        );

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
          // Still there and still claimable: the poll interval simply has not
          // come round, which is what the fallback being a fallback means.
          assert.strictEqual(row?.state, 'created');
        }),
      );

      it.effect(
        'wakes on a row any writer makes created, not just enqueue',
        () =>
          Effect.gen(function* () {
            yield* clear;
            // The trigger fires on `AFTER INSERT OR UPDATE OF state`, so the
            // expiry reaper putting an attempt back — or an operator running an
            // UPDATE by hand, as here — announces the job exactly as an enqueue
            // does. Nothing in application code has to remember to.
            const { schema } = yield* QueueHarness;
            const harness = yield* QueueHarness;
            const asOwnerSql = (statement: string) =>
              Effect.provideService(
                Effect.flatMap(Database, ({ sql }) => sql.unsafe(statement)),
                Database,
                harness.owner,
              );

            yield* Effect.gen(function* () {
              const worker = yield* JobWorker;
              yield* worker.work('invitation-delivery', () =>
                Effect.succeed('completed' as const),
              );
              // Written straight to the table in a state the worker will not
              // claim, so the insert's own notification cannot be what settles
              // it, then flipped to `created` once the worker is idle.
              yield* asOwnerSql(
                `INSERT INTO ${schema}.jobs
                 (queue, payload, state, policy, attempts, retry_limit,
                  expire_in_seconds, run_at, keep_until, created_at)
               VALUES ('invitation-delivery',
                       '{"deliveryId":"${DELIVERY_ID}"}'::jsonb,
                       'failed', 'standard', 0, 0, 60,
                       now(), now() + interval '1 day', now())`,
              );
              yield* Effect.sleep(SETTLE);

              yield* asOwnerSql(
                `UPDATE ${schema}.jobs SET state = 'created', attempts = 0`,
              );
              const settled = yield* awaitCompleted;
              assert.isTrue(
                Option.isSome(settled),
                'an UPDATE to created did not wake the worker',
              );
            }).pipe(
              Effect.provide(
                layerWorker({
                  background: true,
                  pollInterval: POLL_INTERVAL,
                  listen: true,
                }),
              ),
            );
          }),
      );
    },
  );
});
