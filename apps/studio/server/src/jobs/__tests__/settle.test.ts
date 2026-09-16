import { assert, describe, layer } from '@effect/vitest';
import {
  Cron,
  DateTime,
  Deferred,
  Duration,
  Effect,
  Fiber,
  Layer,
  Random,
  Result,
} from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { Database, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import { resolvedQueue } from '../queues.ts';
import {
  backoffSeconds,
  JobWorker,
  type JobOutcome,
  returnToQueue,
} from '../worker.ts';
import {
  asApp,
  asMaintenance,
  asOwner,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
} from './support.ts';

// The window between a claim and its settle, and what has to be true inside
// it. A handler runs *outside* the claim's transaction — that is deliberate,
// because holding a transaction open across a network call is how a pool
// starves — so the expiry reaper can return the row and a second worker can
// claim it while the first attempt is still running. Every case below drives
// that sequence with two real workers against one real Postgres, in virtual
// time, and asks what the row says afterwards.
//
// Also here: what the reaper writes when it returns a row (the ladder, not a
// bare `run_at = now`), that a stopping worker claims nothing, and that a boot
// does not push a due cron occurrence forward.

const db = await reachableDb();

const DELIVERY = resolvedQueue('invitation-delivery');

const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';

/** A pinned seed, so the jittered backoff has one answer. */
const SEED = 'studio-jobs';

/** What `reapExpired` writes to `last_error` in place of a handler's. */
const LEASE_EXPIRED = 'the attempt did not finish before its lease expired';

describe.skipIf(!db)('settling against the attempt that owns the row', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const clear = Effect.gen(function* () {
      const { schema } = yield* QueueHarness;
      yield* asOwner(
        Effect.flatMap(Database, ({ sql }) =>
          sql.unsafe(`DELETE FROM ${schema}.jobs`),
        ),
      );
      yield* asOwner(
        Effect.flatMap(Database, ({ sql }) =>
          sql.unsafe(`DELETE FROM ${schema}.job_schedules`),
        ),
      );
    });

    const jobsLayer = Layer.unwrap(
      Effect.map(QueueHarness, (harness) =>
        Jobs.layer({ schema: harness.schema }),
      ),
    );

    const enqueueDelivery = (deliveryId = DELIVERY_ID) =>
      Effect.flatMap(Jobs, (jobs) =>
        asApp(
          withTransaction(jobs.enqueue('invitation-delivery', { deliveryId })),
        ),
      );

    /** An owner-side edit of a job row; the suites' stand-in for a redeploy. */
    const updateJob = (jobId: string, assignment: string) =>
      Effect.gen(function* () {
        const { schema } = yield* QueueHarness;
        yield* asOwner(
          Effect.flatMap(Database, ({ sql }) =>
            sql.unsafe(
              `UPDATE ${schema}.jobs SET ${assignment} WHERE id = '${jobId}'`,
            ),
          ),
        );
      });

    const readSchedule = Effect.fnUntraced(function* (name: string) {
      const { schema } = yield* QueueHarness;
      const rows = yield* asOwner(
        Effect.flatMap(
          Database,
          ({ sql }) =>
            sql<{ cron: string; next_run_at: number }>`
              SELECT cron, next_run_at
                FROM ${sql(schema)}.job_schedules
               WHERE name = ${name}`,
        ),
      );
      return rows[0];
    });

    const cronNext = (expression: string, at: DateTime.Utc) => {
      const parsed = Cron.parse(expression, 'UTC');
      if (Result.isFailure(parsed)) {
        throw new Error(`the case's own cron does not parse: ${expression}`);
      }
      return Cron.next(parsed.success, DateTime.toDate(at)).getTime();
    };

    /**
     * Claims the one queued delivery on a worker of its own and leaves the
     * handler blocked inside it, so the case can move virtual time past the
     * lease while the attempt is still running. Returns the fiber running the
     * step, so the case decides when — and whether — the handler finishes.
     */
    const claimAndHold = (
      first: JobWorker['Service'],
      started: Deferred.Deferred<void>,
      held: Deferred.Deferred<void>,
      outcome: Effect.Effect<JobOutcome, unknown>,
    ) =>
      Effect.gen(function* () {
        yield* first.work('invitation-delivery', () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(held);
            return yield* outcome;
          }),
        );
        const running = yield* Effect.forkChild(
          first.drainOnce('invitation-delivery'),
        );
        yield* Deferred.await(started);
        return running;
      });

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
            const running = yield* claimAndHold(
              first,
              started,
              held,
              Effect.succeed<JobOutcome>('completed'),
            );

            // The lease runs out while the handler is still going and the
            // reaper puts the row back: nothing tells the running handler.
            yield* TestClock.adjust(
              Duration.seconds(DELIVERY.expireInSeconds + 1),
            );
            assert.strictEqual(yield* first.reapExpired, 1);
            const [returned] = yield* readJobs('invitation-delivery');
            assert.strictEqual(returned?.state, 'created');
            yield* TestClock.setTime(returned!.run_at);

            // A second worker takes the second attempt and finishes it. Its
            // outcome differs from the first's, so the assertion below can
            // only be satisfied by the row still being the second's.
            const second = yield* Effect.gen(function* () {
              const other = yield* JobWorker;
              yield* other.work('invitation-delivery', () =>
                Effect.succeed<JobOutcome>('suppressed'),
              );
              return yield* other.drainOnce('invitation-delivery');
            }).pipe(Effect.provide(layerWorker()));
            assert.strictEqual(second._tag, 'settled');

            yield* Deferred.succeed(held, undefined);
            return yield* Fiber.join(running);
          }).pipe(Effect.provide(layerWorker()));

          const [row] = yield* readJobs('invitation-delivery');
          assert.strictEqual(row?.state, 'completed');
          assert.strictEqual(row?.attempts, 2);
          // The second attempt said `suppressed` and the first would have said
          // `completed`: this is the row the running attempt wrote, not the
          // stale one's.
          assert.strictEqual(row?.outcome, 'suppressed');
          // And the first attempt's step says it wrote nothing.
          assert.strictEqual(stale._tag, 'idle');
        }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect(
      'neither resurrects nor dead-letters a row a later attempt owns',
      () =>
        Effect.gen(function* () {
          yield* clear;
          const jobId = yield* enqueueDelivery();
          // Claimed as a last attempt, so the first worker's own settle would
          // take the failing leg and write the dead-letter copy. The row's
          // ladder is reopened straight afterwards, so the reaper returns it
          // rather than failing it — the first worker settles by the policy it
          // froze at claim time, which is what freezing it is for.
          yield* updateJob(jobId, 'retry_limit = 0');

          const held = yield* Deferred.make<void>();
          const started = yield* Deferred.make<void>();

          const stale = yield* Effect.gen(function* () {
            const first = yield* JobWorker;
            const running = yield* claimAndHold(
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
            yield* TestClock.setTime(returned!.run_at);

            const second = yield* Effect.gen(function* () {
              const other = yield* JobWorker;
              yield* other.work('invitation-delivery', () =>
                Effect.succeed<JobOutcome>('completed'),
              );
              return yield* other.drainOnce('invitation-delivery');
            }).pipe(Effect.provide(layerWorker()));
            assert.strictEqual(second._tag, 'settled');

            yield* Deferred.succeed(held, undefined);
            return yield* Fiber.join(running);
          }).pipe(Effect.provide(layerWorker()));

          const rows = yield* readJobs();
          const original = rows.find((row) => row.id === jobId);
          // Not `created` and not `failed`: an unfenced failure would have put
          // a row a second worker had already completed back on the queue for
          // a third claim, or ended it under the first attempt's own ladder.
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
          const running = yield* claimAndHold(
            worker,
            started,
            held,
            Effect.succeed<JobOutcome>('completed'),
          );
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
        // The copy #1307's manual re-send works from. An expiry that skipped
        // it would leave the queue an operator watches empty for a delivery
        // that has genuinely run out of attempts.
        const copy = rows.find(
          (row) => row.queue === 'invitation-delivery-dead-letter',
        );
        assert.strictEqual(copy?.state, 'created');
        assert.strictEqual(copy?.dead_letter_of, jobId);
        assert.deepStrictEqual(copy?.payload, { deliveryId: DELIVERY_ID });
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('backs off a lease that expired with attempts left', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery();

        const held = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const running = yield* claimAndHold(
            worker,
            started,
            held,
            Effect.succeed<JobOutcome>('completed'),
          );
          yield* TestClock.adjust(
            Duration.seconds(DELIVERY.expireInSeconds + 1),
          );
          // The same draw as the standalone formula below: the reaper asks
          // `Random` once per row it settles.
          const reaped = yield* worker.reapExpired.pipe(Random.withSeed(SEED));
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
        assert.strictEqual(row?.last_error, LEASE_EXPIRED);
        assert.strictEqual(
          row?.run_at,
          DateTime.toDate(
            DateTime.addDuration(now, Duration.seconds(delay)),
          ).getTime(),
        );
        // Said twice on purpose: a reaper that wrote `run_at = now` would
        // retry a handler that hangs every time at its own cadence, throwing
        // away the ladder `invitation-delivery` declares.
        assert.notStrictEqual(row?.run_at, DateTime.toDate(now).getTime());
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('tells a handler which attempt the queue will not retry', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobId = yield* enqueueDelivery();
        // One retry left, so attempt 1 is not the last and attempt 2 is. The
        // boundary is the whole of it: `finalAttempt` is what makes
        // `invitation-delivery`'s handler stamp `failed_at` on the delivery
        // row, a terminal mark the queue must agree with. Off by one and the
        // row says an invitation failed for good while an attempt is still
        // owed.
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
          yield* TestClock.setTime(retried!.run_at);

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

        const step = yield* Effect.gen(function* () {
          // No `work()` call at all: a replica that does not work this queue.
          const worker = yield* JobWorker;
          return yield* worker.drainOnce('invitation-delivery');
        }).pipe(Effect.provide(layerWorker()));

        assert.strictEqual(step._tag, 'idle');
        const [row] = yield* readJobs('invitation-delivery');
        // The claim spent an attempt; putting the row back gives it back, so a
        // replica without the handler costs the job nothing.
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
          const running = yield* claimAndHold(
            first,
            firstStarted,
            firstHeld,
            Effect.succeed<JobOutcome>('completed'),
          );

          // The reap-then-reclaim every case in this file builds: the lease
          // runs out, the reaper puts the row back, a second worker takes the
          // second attempt and is still running it.
          yield* TestClock.adjust(
            Duration.seconds(DELIVERY.expireInSeconds + 1),
          );
          assert.strictEqual(yield* first.reapExpired, 1);
          const [returned] = yield* readJobs('invitation-delivery');
          yield* TestClock.setTime(returned!.run_at);

          const secondRunning = yield* Effect.gen(function* () {
            const other = yield* JobWorker;
            return yield* claimAndHold(
              other,
              secondStarted,
              secondHeld,
              Effect.succeed<JobOutcome>('completed'),
            );
          }).pipe(Effect.provide(layerWorker()));

          const [claimed] = yield* readJobs('invitation-delivery');
          assert.strictEqual(claimed?.state, 'active');
          assert.strictEqual(claimed?.attempts, 2);

          // The write the first attempt's worker would make if it had claimed
          // from a queue it registers no handler for. Run directly because
          // `drainOnce` claims and puts back in the same breath, with no seam
          // a case could suspend it at — the statement is the real one, and
          // the row underneath it is the real reclaimed row.
          const answered = yield* asMaintenance(
            withTransaction(returnToQueue(schema, jobId, 1)),
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
        // Unfenced, this write resurrects a job the second worker is running:
        // `created` again with its ladder wound back an attempt, which fans the
        // send out rather than merely repeating it.
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

          // Read inside the permit, not only by the poll fiber: a fiber that
          // passed the fiber's own check and then waited for a permit must
          // still not claim.
          yield* worker.setFetching(false);
          const stopped = yield* worker.drainOnce('invitation-delivery');
          assert.strictEqual(stopped._tag, 'idle');
          assert.deepStrictEqual(ran, []);
          const [waiting] = yield* readJobs('invitation-delivery');
          assert.strictEqual(waiting?.state, 'created');
          assert.strictEqual(waiting?.attempts, 0);

          // The positive half, so the negative one cannot be vacuous: the same
          // worker, the same job, fetching back on.
          yield* worker.setFetching(true);
          const claimed = yield* worker.drainOnce('invitation-delivery');
          assert.strictEqual(claimed._tag, 'settled');
          assert.deepStrictEqual(ran, [1]);
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('leaves a due schedule where it is when a replica boots', () =>
      Effect.gen(function* () {
        yield* clear;
        const { schema } = yield* QueueHarness;

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const now = yield* DateTime.now;

          yield* worker.schedule(
            'the-nightly-sweep',
            '0 3 * * *',
            'denied-attempts-summary',
            {},
          );
          assert.strictEqual(
            (yield* readSchedule('the-nightly-sweep'))?.next_run_at,
            cronNext('0 3 * * *', now),
          );

          // The occurrence has come due and the cron fiber has not ticked yet
          // — the ≤15 s window a restarting replica lands in.
          yield* asOwner(
            Effect.flatMap(Database, ({ sql }) =>
              sql.unsafe(
                `UPDATE ${schema}.job_schedules
                    SET next_run_at = to_timestamp(0)
                  WHERE name = 'the-nightly-sweep'`,
              ),
            ),
          );

          yield* worker.schedule(
            'the-nightly-sweep',
            '0 3 * * *',
            'denied-attempts-summary',
            {},
          );
          assert.strictEqual(
            (yield* readSchedule('the-nightly-sweep'))?.next_run_at,
            0,
            'a boot pushed a schedule that was already due forward, skipping it',
          );

          // A changed expression is the one case where the stored time means
          // something the deployment no longer asked for.
          yield* worker.schedule(
            'the-nightly-sweep',
            '30 4 * * *',
            'denied-attempts-summary',
            {},
          );
          const changed = yield* readSchedule('the-nightly-sweep');
          assert.strictEqual(changed?.cron, '30 4 * * *');
          assert.strictEqual(changed?.next_run_at, cronNext('30 4 * * *', now));
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );
  });
});

// The stop window, which only exists in real time: it is made of a poll fiber
// and a finalizer racing for the same semaphore permit, and `TestClock` would
// decide that race by fiat.
describe.skipIf(!db)('claiming during a graceful stop', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const jobsLayer = Layer.unwrap(
        Effect.map(QueueHarness, (harness) =>
          Jobs.layer({ schema: harness.schema }),
        ),
      );

      const clear = Effect.gen(function* () {
        const { schema } = yield* QueueHarness;
        yield* asOwner(
          Effect.flatMap(Database, ({ sql }) =>
            sql.unsafe(`DELETE FROM ${schema}.jobs`),
          ),
        );
      });

      /** Long enough for a woken poll fiber to reach the semaphore. */
      const SETTLE = Duration.millis(200);

      it.effect('claims nothing a stop is already under way for', () =>
        Effect.gen(function* () {
          yield* clear;

          const startClosing = yield* Deferred.make<void>();
          const heldDelivery = yield* Deferred.make<void>();
          const deliveryStarted = yield* Deferred.make<void>();
          const signInRan = yield* Deferred.make<void>();

          // One permit for the whole worker, so the delivery handler below
          // holds the only one and every other drain has to queue behind it —
          // including the stop finalizer, which takes every permit.
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

          const delivery = yield* Effect.flatMap(Jobs, (jobs) =>
            asApp(
              withTransaction(
                jobs.enqueue('invitation-delivery', {
                  deliveryId: DELIVERY_ID,
                }),
              ),
            ),
          );
          yield* Deferred.await(deliveryStarted);

          // Enqueued while the permit is held, so the sign-in poll fiber wakes
          // on the notification, enters `drainOnce`, and parks on the
          // semaphore — a waiter registered *before* the stop begins.
          const signIn = yield* Effect.flatMap(Jobs, (jobs) =>
            asApp(
              withTransaction(
                jobs.enqueue('sign-in-email', {
                  email: 'someone@example.test',
                  url: 'https://studio.example.test/magic',
                }),
              ),
            ),
          );
          yield* Effect.sleep(SETTLE);

          // Now stop. The finalizer sets `fetching = false` and queues for the
          // permit behind that parked drain.
          yield* Deferred.succeed(startClosing, undefined);
          yield* Effect.sleep(SETTLE);

          // Releasing the delivery hands the permit to the parked drain, which
          // is inside the stop window and must claim nothing.
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
