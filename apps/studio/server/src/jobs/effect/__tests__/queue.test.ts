import { assert, describe, layer } from '@effect/vitest';
import {
  Cause,
  DateTime,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Random,
} from 'effect';
import { TestClock } from 'effect/testing';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { JobClock } from '../clock.ts';
import { Database, Transaction, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import { resolvedQueue } from '../queues.ts';
import {
  backoffSeconds,
  JobWorker,
  type JobOutcome,
  type JobStep,
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

// Everything the queue does on its own: the retry ladder, dead-lettering,
// singletons, the expiry reaper, retention, depths, fetching, and the
// graceful stop. Every one of them runs in virtual time against a real
// Postgres, which is possible only because the queue asks `Clock` for the
// time and passes it to the database as a parameter (see worker.ts).

const db = await reachableDb();

/** The delivery queue's declaration, which the cases assert against. */
const DELIVERY = resolvedQueue('invitation-delivery');

const DELIVERY_ID = '55555555-5555-4555-8555-555555555555';

/** A pinned seed, so the jittered backoff below has one answer. */
const SEED = 'effect-native-jobs-spike';

describe.skipIf(!db)('the native queue', () => {
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

    /** Registers a handler and hands back the worker, under one layer. */
    const withWorker = <A, E, R>(
      handler: (attempt: number) => Effect.Effect<JobOutcome, unknown>,
      body: (worker: JobWorker['Service']) => Effect.Effect<A, E, R>,
    ) =>
      Effect.gen(function* () {
        const worker = yield* JobWorker;
        yield* worker.work('invitation-delivery', (job) =>
          handler(job.attempt),
        );
        return yield* body(worker);
      }).pipe(Effect.provide(layerWorker()));

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

    /** A replica whose clock runs five minutes fast. */
    const SKEW = Duration.minutes(5);

    const skewedJobs = Layer.unwrap(
      Effect.map(QueueHarness, (harness) =>
        Jobs.layer({ schema: harness.schema }).pipe(
          Layer.provide(JobClock.layerOffset(SKEW)),
        ),
      ),
    );

    it.effect(
      'leaves a skewed replica’s job unclaimable by an unskewed one',
      () =>
        Effect.gen(function* () {
          yield* clear;
          // Enqueued "now" by a process whose clock is five minutes fast, so the
          // row's `run_at` is five minutes ahead of everyone else's now. This is
          // the hazard an app-clock queue has and pg-boss's database-clock one
          // does not, and the reason `JobClock.layer` exists.
          yield* Effect.provide(
            Effect.flatMap(Jobs, (jobs) =>
              asApp(
                withTransaction(
                  jobs.enqueue('invitation-delivery', {
                    deliveryId: DELIVERY_ID,
                  }),
                ),
              ),
            ),
            skewedJobs,
          );

          const unskewed = yield* withWorker(
            () => Effect.succeed<JobOutcome>('completed'),
            (worker) => worker.drainOnce('invitation-delivery'),
          );
          assert.strictEqual(unskewed._tag, 'idle');

          // The positive half: a worker reading the *same* clock claims it at
          // once, which is what a measured correction buys — both processes
          // agree on what "now" is, whatever their hardware clocks say.
          const agreeing = yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed<JobOutcome>('completed'),
            );
            return yield* worker.drainOnce('invitation-delivery');
          }).pipe(Effect.provide(layerWorker({}, JobClock.layerOffset(SKEW))));
          assert.strictEqual(agreeing._tag, 'settled');
        }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('corrects the clock against the database’s own now()', () =>
      Effect.gen(function* () {
        // Virtual time starts at the epoch, so an uncorrected clock is fifty-odd
        // years behind the database. `JobClock.layer` measures that difference
        // at build and adds it back, which is the whole of the correction.
        const virtual = yield* DateTime.now;
        assert.isBelow(DateTime.toEpochMillis(virtual), 1000);

        const corrected = yield* asMaintenance(
          Effect.provide(
            Effect.flatMap(JobClock, (clock) => clock.now),
            JobClock.layer({ clockMonitorInterval: Duration.hours(1) }),
          ),
        );
        // Against the real wall clock, which is what the database's is.
        assert.isBelow(
          Math.abs(DateTime.toEpochMillis(corrected) - Date.now()),
          5_000,
        );
      }),
    );

    it.effect('freezes the queue’s retry policy onto the row at enqueue', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery();
        const [row] = yield* readJobs('invitation-delivery');
        assert.deepStrictEqual(
          {
            policy: row?.policy,
            retry_limit: row?.retry_limit,
            retry_delay: row?.retry_delay,
            retry_backoff: row?.retry_backoff,
            retry_delay_max: row?.retry_delay_max,
            expire_in_seconds: row?.expire_in_seconds,
          },
          {
            policy: DELIVERY.policy,
            retry_limit: DELIVERY.retryLimit,
            retry_delay: DELIVERY.retryDelay,
            retry_backoff: DELIVERY.retryBackoff,
            retry_delay_max: DELIVERY.retryDelayMax,
            expire_in_seconds: DELIVERY.expireInSeconds,
          },
        );
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('settles by the row’s retry policy, not the declaration’s', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobId = yield* enqueueDelivery();
        // What a redeploy that narrowed the queue's `retryLimit` to zero would
        // leave behind — except that it would leave the *old* value on the row
        // and the new one in the declaration, which is the direction that
        // matters: the declaration says seven, the row says none.
        yield* updateJob(jobId, 'retry_limit = 0');
        assert.strictEqual(DELIVERY.retryLimit, 7);

        const step = yield* withWorker(
          () => Effect.fail(new Error('SMTP temporarily unavailable')),
          (worker) => worker.drainOnce('invitation-delivery'),
        );

        // A queue that read its declaration here would have retried.
        assert.strictEqual(step._tag, 'failed');
        const rows = yield* readJobs();
        assert.strictEqual(
          rows.find((row) => row.id === jobId)?.state,
          'failed',
        );
        // And the dead-letter copy carries the *target* queue's policy, frozen
        // at copy time.
        const dead = resolvedQueue('invitation-delivery-dead-letter');
        const copy = rows.find(
          (row) => row.queue === 'invitation-delivery-dead-letter',
        );
        assert.strictEqual(copy?.retry_limit, dead.retryLimit);
        assert.strictEqual(copy?.expire_in_seconds, dead.expireInSeconds);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('leases an attempt for the row’s own expiry', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobId = yield* enqueueDelivery();
        yield* updateJob(jobId, 'expire_in_seconds = 7');
        assert.notStrictEqual(DELIVERY.expireInSeconds, 7);

        const held = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('invitation-delivery', () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(held);
              return 'completed' as const;
            }),
          );
          // Forked and held open, because the settle nulls `locked_until`:
          // the lease only exists while the attempt is running.
          const running = yield* Effect.forkChild(
            worker.drainOnce('invitation-delivery'),
          );
          yield* Deferred.await(started);

          const now = yield* DateTime.now;
          const [row] = yield* readJobs('invitation-delivery');
          assert.strictEqual(row?.state, 'active');
          assert.strictEqual(
            row?.locked_until,
            DateTime.toDate(DateTime.addDuration(now, '7 seconds')).getTime(),
          );

          yield* Deferred.succeed(held, undefined);
          yield* Fiber.join(running);
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('moves run_at by exactly pg-boss’s backoff formula', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery();

        const step = yield* withWorker(
          () => Effect.fail(new Error('SMTP temporarily unavailable')),
          (worker) => worker.drainOnce('invitation-delivery'),
        ).pipe(Random.withSeed(SEED));

        assert.strictEqual(step._tag, 'retrying');
        const retrying = step as Extract<JobStep, { _tag: 'retrying' }>;
        assert.strictEqual(retrying.attempt, 1);

        // The same draw, from the same seed: `drainOnce` asks `Random` once.
        const delay = yield* backoffSeconds(DELIVERY, 1).pipe(
          Random.withSeed(SEED),
        );
        // Between half and all of retryDelay * 2^1 — the bound the formula
        // guarantees whatever the seed, asserted beside the exact value so a
        // changed seed cannot quietly make the exact check vacuous.
        assert.isAtLeast(delay, DELIVERY.retryDelay);
        assert.isAtMost(delay, DELIVERY.retryDelay * 2);

        const now = yield* DateTime.now;
        const expected = DateTime.toDate(
          DateTime.addDuration(now, Duration.seconds(delay)),
        ).getTime();

        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'created');
        assert.strictEqual(row?.attempts, 1);
        assert.strictEqual(row?.run_at, expected);
        assert.strictEqual(row?.last_error, 'SMTP temporarily unavailable');
        assert.strictEqual(row?.locked_until, null);

        // And the job is not claimable until virtual time reaches it.
        const tooEarly = yield* withWorker(
          () => Effect.succeed<JobOutcome>('completed'),
          (worker) => worker.drainOnce('invitation-delivery'),
        );
        assert.strictEqual(tooEarly._tag, 'idle');

        yield* TestClock.adjust(Duration.seconds(Math.ceil(delay)));
        const claimed = yield* withWorker(
          () => Effect.succeed<JobOutcome>('completed'),
          (worker) => worker.drainOnce('invitation-delivery'),
        );
        assert.strictEqual(claimed._tag, 'settled');
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('dead-letters on the attempt the queue will not retry', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobId = yield* enqueueDelivery();

        // Walk the whole ladder: eight attempts for a limit of seven.
        let last: JobStep = { _tag: 'idle' };
        for (let attempt = 1; attempt <= DELIVERY.retryLimit + 1; attempt++) {
          last = yield* withWorker(
            () => Effect.fail(new Error('permanent SMTP failure')),
            (worker) => worker.drainOnce('invitation-delivery'),
          ).pipe(Random.withSeed(SEED));
          if (last._tag === 'retrying') {
            // The ladder's own delay, taken from the row rather than guessed.
            const [row] = yield* readJobs('invitation-delivery');
            yield* TestClock.setTime(row!.run_at);
          }
        }

        assert.strictEqual(last._tag, 'failed');
        const failed = last as Extract<JobStep, { _tag: 'failed' }>;
        assert.strictEqual(failed.attempt, DELIVERY.retryLimit + 1);
        assert.isString(failed.deadLetter);

        const rows = yield* readJobs();
        const original = rows.find((row) => row.id === jobId);
        const copy = rows.find(
          (row) => row.queue === 'invitation-delivery-dead-letter',
        );
        assert.strictEqual(original?.state, 'failed');
        assert.strictEqual(original?.attempts, DELIVERY.retryLimit + 1);
        assert.strictEqual(original?.last_error, 'permanent SMTP failure');
        assert.strictEqual(copy?.state, 'created');
        assert.strictEqual(copy?.dead_letter_of, jobId);
        assert.deepStrictEqual(copy?.payload, { deliveryId: DELIVERY_ID });
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('lets a job on a singleton queue wait for the active one', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobs = yield* Jobs;
        // `singleton` is a limit on how many may be *active*, not on how many
        // may exist: pg-boss's own `job_i2` indexes `WHERE state = 'active'`
        // and its `send` inserts a second `created` row happily. Both are
        // accepted here too.
        const first = yield* asApp(
          withTransaction(jobs.enqueue('denied-attempts-summary', {})),
        );
        const second = yield* asApp(
          withTransaction(jobs.enqueue('denied-attempts-summary', {})),
        );
        assert.notStrictEqual(first, second);
        const queued = yield* readJobs('denied-attempts-summary');
        assert.strictEqual(queued.length, 2);
        // The marker the partial index arbitrates over is on the row, because
        // an index cannot read a declaration.
        assert.deepStrictEqual(
          queued.map((row) => row.policy),
          ['singleton', 'singleton'],
        );

        const held = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('denied-attempts-summary', () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(held);
              return 'completed' as const;
            }),
          );

          const running = yield* Effect.forkChild(
            worker.drainOnce('denied-attempts-summary'),
          );
          yield* Deferred.await(started);

          const live = yield* readJobs('denied-attempts-summary');
          assert.deepStrictEqual(live.map((row) => row.state).sort(), [
            'active',
            'created',
          ]);

          // And the waiting one is not claimable while the first is active —
          // asked of a second worker with an instant handler, as a second
          // replica is, so a guard that failed to hold would answer `settled`
          // rather than hanging on this suite's held one.
          const blocked = yield* Effect.gen(function* () {
            const other = yield* JobWorker;
            yield* other.work('denied-attempts-summary', () =>
              Effect.succeed<JobOutcome>('completed'),
            );
            return yield* other.drainOnce('denied-attempts-summary');
          }).pipe(Effect.provide(layerWorker()));
          assert.strictEqual(blocked._tag, 'idle');

          yield* Deferred.succeed(held, undefined);
          const settled = yield* Fiber.join(running);
          assert.strictEqual(settled._tag, 'settled');

          // Now it is: the limit was on the active row, not on the queue.
          const next = yield* worker.drainOnce('denied-attempts-summary');
          assert.strictEqual(next._tag, 'settled');
        }).pipe(Effect.provide(layerWorker()));

        const done = yield* readJobs('denied-attempts-summary');
        assert.deepStrictEqual(
          done.map((row) => row.state),
          ['completed', 'completed'],
        );
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('refuses a second job on the same singleton key', () =>
      Effect.gen(function* () {
        yield* clear;
        const jobs = yield* Jobs;
        const first = yield* asApp(
          withTransaction(
            jobs.enqueue(
              'denied-attempts-summary',
              {},
              { singletonKey: 'the-sweep' },
            ),
          ),
        );
        assert.isString(first);

        // Refused, not a no-op and not a unique violation: the caller's
        // transaction survives and the failure is typed.
        const second = yield* Effect.exit(
          asApp(
            withTransaction(
              jobs.enqueue(
                'denied-attempts-summary',
                {},
                { singletonKey: 'the-sweep' },
              ),
            ),
          ),
        );
        assert.isTrue(Exit.isFailure(second));
        const error = Option.getOrUndefined(
          Cause.findErrorOption(
            Exit.isFailure(second) ? second.cause : Cause.empty,
          ),
        );
        assert.strictEqual(
          (error as { _tag?: string } | undefined)?._tag,
          'JobRefused',
        );

        // The transaction the refusal happened in still commits its own work:
        // a unique violation would have poisoned it.
        const survived = yield* asApp(
          withTransaction(
            Effect.gen(function* () {
              const outcome = yield* Effect.exit(
                jobs.enqueue(
                  'denied-attempts-summary',
                  {},
                  { singletonKey: 'the-sweep' },
                ),
              );
              const { sql } = yield* Transaction;
              const rows = yield* sql<{ ok: number }>`SELECT 1 AS ok`;
              return { refused: Exit.isFailure(outcome), ok: rows[0]?.ok };
            }),
          ),
        );
        assert.deepStrictEqual(survived, { refused: true, ok: 1 });

        assert.strictEqual(
          (yield* readJobs('denied-attempts-summary')).length,
          1,
        );

        // A standard queue is unaffected: two jobs, no key.
        yield* enqueueDelivery('66666666-6666-4666-8666-666666666666');
        yield* enqueueDelivery('77777777-7777-4777-8777-777777777777');
        assert.strictEqual((yield* readJobs('invitation-delivery')).length, 2);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('returns a job whose lease expired, with its attempt spent', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery();

        const held = yield* Deferred.make<void>();
        const started = yield* Deferred.make<void>();

        const outcome = yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('invitation-delivery', () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(held);
              return 'completed' as const;
            }),
          );
          // A handler that outlives its lease: forked, so the case can move
          // virtual time past the expiry while the attempt is still running.
          const running = yield* Effect.forkChild(
            worker.drainOnce('invitation-delivery'),
          );
          yield* Deferred.await(started);

          const [claimed] = yield* readJobs('invitation-delivery');
          assert.strictEqual(claimed?.state, 'active');
          assert.strictEqual(claimed?.attempts, 1);

          // Not yet: the lease has not run out.
          yield* TestClock.adjust(
            Duration.seconds(DELIVERY.expireInSeconds - 1),
          );
          assert.strictEqual(yield* worker.reapExpired, 0);

          yield* TestClock.adjust(Duration.seconds(2));
          const reaped = yield* worker.reapExpired;

          yield* Fiber.interrupt(running);
          return reaped;
        }).pipe(Effect.provide(layerWorker()));

        assert.strictEqual(outcome, 1);
        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'created');
        // Counted at claim time, so a handler that hangs every time still
        // walks the ladder rather than looping forever.
        assert.strictEqual(row?.attempts, 1);
        assert.strictEqual(row?.locked_until, null);
        assert.strictEqual(
          row?.last_error,
          'the attempt did not finish before its lease expired',
        );
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('deletes terminal rows and jobs nothing ever claimed', () =>
      Effect.gen(function* () {
        yield* clear;
        // sign-in-email: retention 600 s, deletion 60 s — the queue whose
        // whole point is that its payload does not outlive the link.
        const signIn = resolvedQueue('sign-in-email');
        const jobs = yield* Jobs;
        const completed = yield* asApp(
          withTransaction(
            jobs.enqueue('sign-in-email', {
              email: 'someone@example.test',
              url: 'https://studio.example.test/magic',
            }),
          ),
        );
        const abandoned = yield* asApp(
          withTransaction(
            jobs.enqueue('sign-in-email', {
              email: 'other@example.test',
              url: 'https://studio.example.test/other',
            }),
          ),
        );

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('sign-in-email', () =>
            Effect.succeed<JobOutcome>('completed'),
          );
          const step = yield* worker.drainOnce('sign-in-email');
          assert.strictEqual(step._tag, 'settled');

          // Nothing is due yet.
          assert.strictEqual(yield* worker.deleteExpired, 0);

          yield* TestClock.adjust(
            Duration.seconds(signIn.deleteAfterSeconds + 1),
          );
          assert.strictEqual(yield* worker.deleteExpired, 1);
          const left = yield* readJobs('sign-in-email');
          assert.deepStrictEqual(
            left.map((row) => row.id),
            [abandoned],
          );

          // And the one nothing ever claimed, once its keep_until passes.
          yield* TestClock.adjust(Duration.seconds(signIn.retentionSeconds));
          assert.strictEqual(yield* worker.deleteExpired, 1);
          assert.deepStrictEqual(yield* readJobs('sign-in-email'), []);
        }).pipe(Effect.provide(layerWorker()));

        void completed;
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('counts the queue by state', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery('88888888-8888-4888-8888-888888888888');
        yield* enqueueDelivery('99999999-9999-4999-8999-999999999999');

        const depths = yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('invitation-delivery', () =>
            Effect.succeed<JobOutcome>('suppressed'),
          );
          yield* worker.drainOnce('invitation-delivery');
          return yield* worker.queueDepths;
        }).pipe(Effect.provide(layerWorker()));

        assert.deepStrictEqual(
          depths.map(({ queue, state, count }) => ({ queue, state, count })),
          [
            { queue: 'invitation-delivery', state: 'completed', count: 1 },
            { queue: 'invitation-delivery', state: 'created', count: 1 },
          ],
        );
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('records what a handler said happened', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery();
        const step = yield* withWorker(
          () => Effect.succeed<JobOutcome>('uncertain'),
          (worker) => worker.drainOnce('invitation-delivery'),
        );
        assert.deepStrictEqual(
          step._tag === 'settled' ? step.outcome : undefined,
          'uncertain',
        );
        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'completed');
        assert.strictEqual(row?.outcome, 'uncertain');
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('kills a job whose payload the queue does not declare', () =>
      Effect.gen(function* () {
        yield* clear;
        const { schema } = yield* QueueHarness;
        // A row written by an older release or by hand; the enqueue path
        // could not produce it.
        yield* asOwner(
          Effect.flatMap(Database, ({ sql }) =>
            sql.unsafe(
              // Timestamps at the epoch, not \`now()\`: the claim compares
              // \`run_at\` against the *virtual* clock, which is where every
              // other row in this suite was written too.
              `INSERT INTO ${schema}.jobs
                 (queue, payload, state, attempts, run_at, keep_until, created_at)
               VALUES ('invitation-delivery', '{"deliveryId":"not-a-uuid"}'::jsonb,
                       'created', 0, to_timestamp(0),
                       to_timestamp(0) + interval '1 day', to_timestamp(0))`,
            ),
          ),
        );

        const step = yield* withWorker(
          () => Effect.succeed<JobOutcome>('completed'),
          (worker) => worker.drainOnce('invitation-delivery'),
        );
        assert.strictEqual(step._tag, 'dead');
        const [row] = yield* readJobs('invitation-delivery');
        // Not retried and not dead-lettered: no attempt can fix it, and the
        // copy would only carry the same payload somewhere else.
        assert.strictEqual(row?.state, 'dead');
        assert.strictEqual(row?.attempts, 1);
      }).pipe(Effect.provide(jobsLayer)),
    );
  });
});

describe.skipIf(!db)('the worker’s background fibers', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
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

    it.effect('stops claiming when fetching is turned off', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* Effect.flatMap(Jobs, (jobs) =>
          asApp(
            withTransaction(
              jobs.enqueue('invitation-delivery', { deliveryId: DELIVERY_ID }),
            ),
          ),
        );

        const handled = yield* Deferred.make<number>();

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const ran: number[] = [];
          yield* worker.work('invitation-delivery', (job) =>
            Effect.gen(function* () {
              ran.push(job.attempt);
              yield* Deferred.succeed(handled, job.attempt);
              return 'completed' as const;
            }),
          );

          yield* worker.setFetching(false);
          // The poll fiber is what consults `fetching`, so the assertion is on
          // what the fiber does over many of its intervals. Each `readJobs` is
          // a real round trip, so the fiber has had chances to run in between
          // rather than merely having had virtual time moved past it.
          for (let tick = 0; tick < 5; tick++) {
            yield* TestClock.adjust(Duration.seconds(10));
            const [waiting] = yield* readJobs('invitation-delivery');
            assert.strictEqual(waiting?.state, 'created');
          }
          assert.deepStrictEqual(ran, []);

          // The positive half, so the negative one above cannot be vacuous:
          // the same fiber, the same interval, fetching back on.
          yield* worker.setFetching(true);
          yield* TestClock.adjust(Duration.seconds(10));
          assert.strictEqual(yield* Deferred.await(handled), 1);
          yield* Effect.retry(
            Effect.flatMap(readJobs('invitation-delivery'), (rows) =>
              rows[0]?.state === 'completed'
                ? Effect.void
                : Effect.fail('not settled yet' as const),
            ),
            { times: 50 },
          );
          assert.deepStrictEqual(ran, [1]);
        }).pipe(
          Effect.provide(
            layerWorker({
              background: true,
              pollInterval: Duration.seconds(1),
            }),
          ),
        );
      }).pipe(Effect.provide(jobsLayer)),
    );

    /**
     * A worker whose layer scope closes the moment `startClosing` is
     * completed, so a case can hold the shutdown still and watch it: the
     * body's return is what closes the layer, and the returned fiber does not
     * finish until every finalizer has.
     */
    const workerUntil = (
      startClosing: Deferred.Deferred<void>,
      handler: Effect.Effect<JobOutcome>,
    ) =>
      Effect.forkChild(
        Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.work('invitation-delivery', () => handler);
          yield* Deferred.await(startClosing);
        }).pipe(
          Effect.provide(
            layerWorker({
              background: true,
              pollInterval: Duration.seconds(1),
              stopTimeout: Duration.seconds(25),
            }),
          ),
        ),
      );

    it.effect('waits for an in-flight handler before it stops', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* Effect.flatMap(Jobs, (jobs) =>
          asApp(
            withTransaction(
              jobs.enqueue('invitation-delivery', { deliveryId: DELIVERY_ID }),
            ),
          ),
        );

        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const interrupted = yield* Deferred.make<void>();
        const startClosing = yield* Deferred.make<void>();

        const running = yield* workerUntil(
          startClosing,
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
            return 'completed' as const;
          }).pipe(
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
          ),
        );

        yield* TestClock.adjust(Duration.seconds(1));
        yield* Deferred.await(started);
        yield* Deferred.succeed(startClosing, undefined);

        // The stop is under way and must not have returned: an in-flight
        // handler holds it. A stop that cut the handler off would finish here.
        yield* TestClock.adjust(Duration.seconds(5));
        assert.strictEqual(running.pollUnsafe(), undefined);
        assert.isFalse(yield* Deferred.isDone(interrupted));

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(running);
        assert.isFalse(yield* Deferred.isDone(interrupted));
        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'completed');
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('interrupts a handler that outstays the stop window', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* Effect.flatMap(Jobs, (jobs) =>
          asApp(
            withTransaction(
              jobs.enqueue('invitation-delivery', { deliveryId: DELIVERY_ID }),
            ),
          ),
        );

        const started = yield* Deferred.make<void>();
        const never = yield* Deferred.make<void>();
        const interrupted = yield* Deferred.make<void>();
        const startClosing = yield* Deferred.make<void>();

        const running = yield* workerUntil(
          startClosing,
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(never);
            return 'completed' as const;
          }).pipe(
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)),
          ),
        );

        yield* TestClock.adjust(Duration.seconds(1));
        yield* Deferred.await(started);
        yield* Deferred.succeed(startClosing, undefined);

        yield* TestClock.adjust(Duration.seconds(24));
        assert.strictEqual(running.pollUnsafe(), undefined);

        // Past the window the scope interrupts what is left, which is the
        // only reason a container's stop is bounded at all.
        yield* TestClock.adjust(Duration.seconds(2));
        yield* Fiber.join(running);
        assert.isTrue(yield* Deferred.isDone(interrupted));
        // Left `active`; the expiry reaper is what returns it.
        const [row] = yield* readJobs('invitation-delivery');
        assert.strictEqual(row?.state, 'active');
      }).pipe(Effect.provide(jobsLayer)),
    );
  });
});
