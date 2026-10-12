import { assert, describe, layer } from '@effect/vitest';
import {
  DateTime,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Random,
  Redacted,
} from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceScope } from '../../db/tenant.ts';
import { collectLeveledLogs } from '../../platform/__tests__/support/logs.ts';
import {
  backoffSeconds,
  type JobOutcome,
  JobWorker,
  returnToQueue,
} from '../worker.ts';
import {
  asMaintenance,
  claimAndHold,
  clearQueue,
  drainWith,
  DELIVERY,
  DELIVERY_ID,
  enqueue,
  enqueueDelivery,
  layerJobs,
  layerQueueHarness,
  layerWorker,
  LEASE_EXPIRED,
  onWorker,
  QueueHarness,
  readJobs,
  SEED,
  updateJob,
} from './support.ts';

const db = await reachableDb();

describe.skipIf(!db)('settling against the attempt that owns the row', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const clear = clearQueue;

    const jobsLayer = layerJobs;

    const holdDelivery = (
      worker: JobWorker['Service'],
      started: Deferred.Deferred<void>,
      held: Deferred.Deferred<void>,
      outcome?: Parameters<typeof claimAndHold>[3],
    ) =>
      claimAndHold(worker, 'invitation-delivery', { started, held }, outcome);

    it.effect(
      'leaves the second attempt’s outcome alone when the first settles late',
      () =>
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueDelivery();

          const held = yield* Deferred.make<void>();
          const started = yield* Deferred.make<void>();

          const stale = yield* Effect.gen(function* () {
            const first = yield* JobWorker;
            const running = yield* holdDelivery(first, started, held);

            yield* TestClock.adjust(
              Duration.seconds(DELIVERY.expireInSeconds + 1),
            );
            assert.strictEqual(yield* first.reapExpired, 1);
            const [returned] = yield* readJobs('invitation-delivery');
            assert.strictEqual(returned?.state, 'created');
            yield* TestClock.setTime(returned!.run_at.getTime());

            const second = yield* drainWith('invitation-delivery', () =>
              Effect.succeed<JobOutcome>('suppressed'),
            );
            assert.strictEqual(second._tag, 'settled');

            yield* Deferred.succeed(held, undefined);
            return yield* Fiber.join(running);
          }).pipe(Effect.provide(layerWorker()));

          const [row] = yield* readJobs('invitation-delivery');
          assert.strictEqual(row?.state, 'completed');
          assert.strictEqual(row?.attempts, 2);
          assert.strictEqual(row?.outcome, 'suppressed');
          assert.strictEqual(stale._tag, 'idle');
        }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect(
      'settles nothing onto a row a later attempt is still running',
      () => {
        const logs = collectLeveledLogs();
        return Effect.gen(function* () {
          yield* clear;
          const jobId = yield* enqueueDelivery();

          const firstHeld = yield* Deferred.make<void>();
          const firstStarted = yield* Deferred.make<void>();
          const secondHeld = yield* Deferred.make<void>();
          const secondStarted = yield* Deferred.make<void>();

          const stale = yield* Effect.gen(function* () {
            const first = yield* JobWorker;
            const running = yield* holdDelivery(first, firstStarted, firstHeld);

            yield* TestClock.adjust(
              Duration.seconds(DELIVERY.expireInSeconds + 1),
            );
            assert.strictEqual(yield* first.reapExpired, 1);
            const [returned] = yield* readJobs('invitation-delivery');
            assert.strictEqual(returned?.state, 'created');
            yield* TestClock.setTime(returned!.run_at.getTime());

            const secondRunning = yield* Effect.gen(function* () {
              const other = yield* JobWorker;
              return yield* claimAndHold(
                other,
                'invitation-delivery',
                { started: secondStarted, held: secondHeld },
                Effect.succeed<JobOutcome>('suppressed'),
              );
            }).pipe(Effect.provide(layerWorker()));

            const [claimed] = yield* readJobs('invitation-delivery');
            assert.strictEqual(claimed?.state, 'active');
            assert.strictEqual(claimed?.attempts, 2);

            yield* Deferred.succeed(firstHeld, undefined);
            const answered = yield* Fiber.join(running);

            const [untouched] = yield* readJobs('invitation-delivery');
            assert.strictEqual(untouched?.state, 'active');
            assert.strictEqual(untouched?.attempts, 2);
            assert.strictEqual(untouched?.outcome, null);
            assert.strictEqual(untouched?.completed_at, null);

            yield* Deferred.succeed(secondHeld, undefined);
            const settled = yield* Fiber.join(secondRunning);
            assert.strictEqual(settled._tag, 'settled');
            return answered;
          }).pipe(Effect.provide(layerWorker()));

          assert.strictEqual(stale._tag, 'idle');
          const [row] = yield* readJobs('invitation-delivery');
          assert.strictEqual(row?.state, 'completed');
          assert.strictEqual(row?.attempts, 2);
          assert.strictEqual(row?.outcome, 'suppressed');

          assert.deepStrictEqual(
            logs.records.map(({ level, message, annotations }) => ({
              level,
              message,
              annotations,
            })),
            [
              {
                level: 'Warn',
                message:
                  'job lost its lease before its attempt could settle; the row belongs to a later attempt',
                annotations: {
                  queue: 'invitation-delivery',
                  job_id: jobId,
                  attempt: 1,
                },
              },
            ],
          );
        }).pipe(Effect.provide(jobsLayer), Effect.provide(logs.layer));
      },
    );

    it.effect(
      'neither resurrects nor dead-letters a row a later attempt owns',
      () =>
        Effect.gen(function* () {
          yield* clear;
          const jobId = yield* enqueueDelivery();
          yield* updateJob(jobId, 'retry_limit = 0');

          const held = yield* Deferred.make<void>();
          const started = yield* Deferred.make<void>();

          const stale = yield* Effect.gen(function* () {
            const first = yield* JobWorker;
            const running = yield* holdDelivery(
              first,
              started,
              held,
              Effect.fail(new Error('SMTP temporarily unavailable')),
            );
            yield* updateJob(jobId, `retry_limit = ${DELIVERY.retryLimit}`);

            yield* TestClock.adjust(
              Duration.seconds(DELIVERY.expireInSeconds + 1),
            );
            assert.strictEqual(yield* first.reapExpired, 1);
            const [returned] = yield* readJobs('invitation-delivery');
            assert.strictEqual(returned?.state, 'created');
            yield* TestClock.setTime(returned!.run_at.getTime());

            const second = yield* drainWith('invitation-delivery', () =>
              Effect.succeed<JobOutcome>('completed'),
            );
            assert.strictEqual(second._tag, 'settled');

            yield* Deferred.succeed(held, undefined);
            return yield* Fiber.join(running);
          }).pipe(Effect.provide(layerWorker()));

          const rows = yield* readJobs();
          const original = rows.find((row) => row.id === jobId);
          assert.strictEqual(original?.state, 'completed');
          assert.strictEqual(original?.attempts, 2);
          assert.deepStrictEqual(
            rows
              .filter((row) => row.queue === 'invitation-delivery-dead-letter')
              .map((row) => row.dead_letter_of),
            [],
          );
          assert.strictEqual(stale._tag, 'idle');
        }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('dead-letters a lease that expired on its last attempt', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobId = yield* enqueueDelivery();
        yield* updateJob(jobId, 'retry_limit = 0');

        const held = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const running = yield* holdDelivery(worker, started, held);
          yield* TestClock.adjust(
            Duration.seconds(DELIVERY.expireInSeconds + 1),
          );
          assert.strictEqual(yield* worker.reapExpired, 1);
          yield* Fiber.interrupt(running);
        }).pipe(Effect.provide(layerWorker()));

        const rows = yield* readJobs();
        const original = rows.find((row) => row.id === jobId);
        assert.strictEqual(original?.state, 'failed');
        assert.strictEqual(original?.last_error, LEASE_EXPIRED);
        const copy = rows.find(
          (row) => row.queue === 'invitation-delivery-dead-letter',
        );
        assert.strictEqual(copy?.state, 'created');
        assert.strictEqual(copy?.dead_letter_of, jobId);
        assert.deepStrictEqual(copy?.payload, { deliveryId: DELIVERY_ID });
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect(
      'returns a lease that expired, not one that has not, on the ladder',
      () =>
        Effect.gen(function* () {
          yield* clear;
          yield* enqueueDelivery();

          const held = yield* Deferred.make<void>();
          const started = yield* Deferred.make<void>();

          yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            const running = yield* holdDelivery(worker, started, held);

            const [claimed] = yield* readJobs('invitation-delivery');
            assert.strictEqual(claimed?.state, 'active');
            assert.strictEqual(claimed?.attempts, 1);

            yield* TestClock.adjust(
              Duration.seconds(DELIVERY.expireInSeconds - 1),
            );
            assert.strictEqual(yield* worker.reapExpired, 0);

            yield* TestClock.adjust(Duration.seconds(2));
            const reaped = yield* worker.reapExpired.pipe(
              Random.withSeed(SEED),
            );
            assert.strictEqual(reaped, 1);
            yield* Fiber.interrupt(running);
          }).pipe(Effect.provide(layerWorker()));

          const delay = yield* backoffSeconds(DELIVERY, 1).pipe(
            Random.withSeed(SEED),
          );
          assert.isAtLeast(delay, DELIVERY.retryDelay);
          assert.isAtMost(delay, DELIVERY.retryDelay * 2);

          const now = yield* DateTime.now;
          const [row] = yield* readJobs('invitation-delivery');
          assert.strictEqual(row?.state, 'created');
          assert.strictEqual(row?.attempts, 1);
          assert.strictEqual(row?.locked_until, null);
          assert.strictEqual(row?.last_error, LEASE_EXPIRED);
          assert.strictEqual(
            row?.run_at.getTime(),
            DateTime.toDate(
              DateTime.addDuration(now, Duration.seconds(delay)),
            ).getTime(),
          );
          assert.notStrictEqual(
            row?.run_at.getTime(),
            DateTime.toDate(now).getTime(),
          );
        }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('tells a handler which attempt the queue will not retry', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobId = yield* enqueueDelivery();
        yield* updateJob(jobId, 'retry_limit = 1');

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const handed: { attempt: number; finalAttempt: boolean }[] = [];
          yield* worker.work('invitation-delivery', (job) =>
            Effect.gen(function* () {
              handed.push({
                attempt: job.attempt,
                finalAttempt: job.finalAttempt,
              });
              return yield* Effect.fail(
                new Error('SMTP refused the recipient'),
              );
            }),
          );

          const first = yield* worker.drainOnce('invitation-delivery');
          assert.strictEqual(first._tag, 'retrying');
          assert.deepStrictEqual(handed, [{ attempt: 1, finalAttempt: false }]);

          const [retried] = yield* readJobs('invitation-delivery');
          yield* TestClock.setTime(retried!.run_at.getTime());

          const second = yield* worker.drainOnce('invitation-delivery');
          assert.strictEqual(second._tag, 'failed');
          assert.deepStrictEqual(handed, [
            { attempt: 1, finalAttempt: false },
            { attempt: 2, finalAttempt: true },
          ]);
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('puts back a job it registers no handler for', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery();

        const step = yield* onWorker((worker) =>
          worker.drainOnce('invitation-delivery'),
        );

        assert.strictEqual(step._tag, 'idle');
        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'created');
        assert.strictEqual(row?.attempts, 0);
        assert.strictEqual(row?.locked_until, null);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('will not put back a row a later attempt has claimed', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobId = yield* enqueueDelivery();
        const { schema } = yield* QueueHarness;

        const firstHeld = yield* Deferred.make<void>();
        const firstStarted = yield* Deferred.make<void>();
        const secondHeld = yield* Deferred.make<void>();
        const secondStarted = yield* Deferred.make<void>();

        const wrote = yield* Effect.gen(function* () {
          const first = yield* JobWorker;
          const running = yield* holdDelivery(first, firstStarted, firstHeld);

          yield* TestClock.adjust(
            Duration.seconds(DELIVERY.expireInSeconds + 1),
          );
          assert.strictEqual(yield* first.reapExpired, 1);
          const [returned] = yield* readJobs('invitation-delivery');
          yield* TestClock.setTime(returned!.run_at.getTime());

          const secondRunning = yield* Effect.gen(function* () {
            const other = yield* JobWorker;
            return yield* holdDelivery(other, secondStarted, secondHeld);
          }).pipe(Effect.provide(layerWorker()));

          const [claimed] = yield* readJobs('invitation-delivery');
          assert.strictEqual(claimed?.state, 'active');
          assert.strictEqual(claimed?.attempts, 2);

          const answered = yield* asMaintenance(
            MaintenanceScope.open(returnToQueue(schema, jobId, 1)),
          );

          yield* Deferred.succeed(secondHeld, undefined);
          yield* Fiber.join(secondRunning);
          yield* Deferred.succeed(firstHeld, undefined);
          yield* Fiber.join(running);
          return answered;
        }).pipe(Effect.provide(layerWorker()));

        assert.isFalse(
          wrote,
          'the stale attempt reported putting back a row it no longer owned',
        );
        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'completed');
        assert.strictEqual(row?.attempts, 2);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('claims nothing once fetching has been turned off', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery();

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const ran: number[] = [];
          yield* worker.work('invitation-delivery', (job) =>
            Effect.sync(() => {
              ran.push(job.attempt);
              return 'completed' as const;
            }),
          );

          yield* worker.setFetching(false);
          const stopped = yield* worker.drainOnce('invitation-delivery');
          assert.strictEqual(stopped._tag, 'idle');
          assert.deepStrictEqual(ran, []);
          const [waiting] = yield* readJobs('invitation-delivery');
          assert.strictEqual(waiting?.state, 'created');
          assert.strictEqual(waiting?.attempts, 0);

          yield* worker.setFetching(true);
          const claimed = yield* worker.drainOnce('invitation-delivery');
          assert.strictEqual(claimed._tag, 'settled');
          assert.deepStrictEqual(ran, [1]);
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );
  });
});

describe.skipIf(!db)('claiming during a graceful stop', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const jobsLayer = layerJobs;
      const clear = clearQueue;

      const SETTLE = Duration.millis(200);

      it.effect('claims nothing a stop is already under way for', () =>
        Effect.gen(function* () {
          yield* clear;

          const startClosing = yield* Deferred.make<void>();
          const heldDelivery = yield* Deferred.make<void>();
          const deliveryStarted = yield* Deferred.make<void>();
          const signInRan = yield* Deferred.make<void>();

          const running = yield* Effect.forkChild(
            Effect.gen(function* () {
              const worker = yield* JobWorker;
              yield* worker.work('invitation-delivery', () =>
                Effect.gen(function* () {
                  yield* Deferred.succeed(deliveryStarted, undefined);
                  yield* Deferred.await(heldDelivery);
                  return 'completed' as const;
                }),
              );
              yield* worker.work('sign-in-email', () =>
                Effect.gen(function* () {
                  yield* Deferred.succeed(signInRan, undefined);
                  return 'completed' as const;
                }),
              );
              yield* Deferred.await(startClosing);
            }).pipe(
              Effect.provide(
                layerWorker({
                  background: true,
                  maxInFlight: 1,
                  pollInterval: Duration.millis(50),
                  stopTimeout: Duration.seconds(25),
                }),
              ),
            ),
          );

          const delivery = yield* enqueueDelivery();
          yield* Deferred.await(deliveryStarted);

          const signIn = yield* enqueue('sign-in-email', {
            email: Redacted.make('someone@example.test'),
            url: Redacted.make('https://studio.example.test/magic'),
          });
          yield* Effect.sleep(SETTLE);

          yield* Deferred.succeed(startClosing, undefined);
          yield* Effect.sleep(SETTLE);

          yield* Deferred.succeed(heldDelivery, undefined);
          yield* Fiber.join(running);

          assert.isFalse(
            yield* Deferred.isDone(signInRan),
            'a job was claimed and run after the stop had begun',
          );
          const rows = yield* readJobs();
          assert.strictEqual(
            rows.find((row) => row.id === delivery)?.state,
            'completed',
          );
          const waiting = rows.find((row) => row.id === signIn);
          assert.strictEqual(waiting?.state, 'created');
          assert.strictEqual(waiting?.attempts, 0);
        }).pipe(Effect.provide(jobsLayer)),
      );
    },
  );
});
