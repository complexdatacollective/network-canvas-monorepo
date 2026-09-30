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

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import { collectLeveledLogs } from '../../platform/__tests__/support/logs.ts';
import { JobClock } from '../clock.ts';
import { Jobs } from '../jobs.ts';
import { resolvedQueue } from '../queues.ts';
import {
  backoffSeconds,
  EXPIRY_BATCH_SIZE,
  JobWorker,
  type JobOutcome,
  type JobStep,
} from '../worker.ts';
import {
  asApp,
  asMaintenance,
  asOwner,
  claimAndHold,
  clearQueue,
  DELIVERY,
  DELIVERY_ID,
  drainWith,
  enqueue,
  enqueueDelivery,
  layerJobs,
  layerQueueHarness,
  layerWorker,
  onWorker,
  QueueHarness,
  readJobs,
  SEED,
  updateJob,
} from './support.ts';

// Everything the queue does on its own: the retry ladder, dead-lettering,
// singletons, the expiry reaper, retention, depths, and the graceful stop.
// Every one of them runs in virtual time against a real Postgres, which is
// possible only because the queue asks `Clock` for the time and passes it to
// the database as a parameter (see worker.ts).
//
// What a *settle* has to be true of — the fence around a late attempt, the
// ladder the reaper writes, and a claim during a stop — is `settle.test.ts`.

const db = await reachableDb();

describe.skipIf(!db)('the native queue', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const clear = clearQueue;

    const jobsLayer = layerJobs;

    /** One step of the delivery queue, with `handler` behind it. */
    const drainDelivery = (
      handler: (attempt: number) => Effect.Effect<JobOutcome, unknown>,
    ) => drainWith('invitation-delivery', (job) => handler(job.attempt));

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
                MaintenanceScope.open(
                  jobs.enqueue('invitation-delivery', {
                    deliveryId: DELIVERY_ID,
                  }),
                ),
              ),
            ),
            skewedJobs,
          );

          const unskewed = yield* drainDelivery(() =>
            Effect.succeed<JobOutcome>('completed'),
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

        const step = yield* drainDelivery(() =>
          Effect.fail(new Error('SMTP temporarily unavailable')),
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
          // Held open, because the settle nulls `locked_until`: the lease only
          // exists while the attempt is running.
          const running = yield* claimAndHold(worker, 'invitation-delivery', {
            started,
            held,
          });

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

        const step = yield* drainDelivery(() =>
          Effect.fail(new Error('SMTP temporarily unavailable')),
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
        const tooEarly = yield* drainDelivery(() =>
          Effect.succeed<JobOutcome>('completed'),
        );
        assert.strictEqual(tooEarly._tag, 'idle');

        yield* TestClock.adjust(Duration.seconds(Math.ceil(delay)));
        const claimed = yield* drainDelivery(() =>
          Effect.succeed<JobOutcome>('completed'),
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
          last = yield* drainDelivery(() =>
            Effect.fail(new Error('permanent SMTP failure')),
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
          MaintenanceScope.open(jobs.enqueue('denied-attempts-summary', {})),
        );
        const second = yield* asApp(
          MaintenanceScope.open(jobs.enqueue('denied-attempts-summary', {})),
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
          const running = yield* claimAndHold(
            worker,
            'denied-attempts-summary',
            { started, held },
          );

          const live = yield* readJobs('denied-attempts-summary');
          assert.deepStrictEqual(live.map((row) => row.state).sort(), [
            'active',
            'created',
          ]);

          // And the waiting one is not claimable while the first is active —
          // asked of a second worker with an instant handler, as a second
          // replica is, so a guard that failed to hold would answer `settled`
          // rather than hanging on this suite's held one.
          const blocked = yield* drainWith('denied-attempts-summary', () =>
            Effect.succeed<JobOutcome>('completed'),
          );
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
          MaintenanceScope.open(
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
            MaintenanceScope.open(
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
          MaintenanceScope.open(
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

    it.effect('settles a backlog of expired leases in bounded pieces', () =>
      Effect.gen(function* () {
        yield* clear;
        const { schema } = yield* QueueHarness;
        // Two full batches and a short one, so the case can tell a bounded
        // pass from an unbounded one by how the work was divided rather than
        // only by how much of it got done.
        const rows = EXPIRY_BATCH_SIZE * 2 + 50;
        yield* asOwner(
          Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
            sql.unsafe(
              // Claimed attempts whose lease ran out at the epoch, which is
              // where this suite's virtual clock starts. Flat retry delay so
              // the ladder needs no `Random` draw per row.
              `INSERT INTO ${schema}.jobs
                 (queue, payload, state, policy, attempts, retry_limit,
                  retry_delay, retry_backoff, retry_delay_max,
                  expire_in_seconds, run_at, keep_until, created_at,
                  locked_until)
               SELECT 'invitation-delivery',
                      jsonb_build_object('deliveryId', '${DELIVERY_ID}'),
                      'active', 'standard', 1, 7,
                      5, false, NULL,
                      60, to_timestamp(0), to_timestamp(0) + interval '1 day',
                      to_timestamp(0), to_timestamp(0)
                 FROM generate_series(1, ${rows})`,
            ),
          ),
        );

        const reaped = yield* onWorker((worker) => worker.reapExpired);
        assert.strictEqual(reaped, rows);

        const settled = yield* readJobs('invitation-delivery');
        assert.lengthOf(settled, rows);
        assert.isTrue(
          settled.every(
            (row) =>
              row.state === 'created' &&
              row.last_error ===
                'the attempt did not finish before its lease expired',
          ),
          'a pass left some of the backlog unsettled',
        );

        // `xmin` is the transaction that last wrote each row, so the sizes of
        // its groups are the sizes of the reaper's transactions. One group of
        // every row is the unbounded pass this replaced: a single transaction
        // holding a lock on the whole backlog.
        const transactions = yield* asOwner(
          Effect.flatMap(
            MaintenanceDatabase,
            ({ sql }) =>
              sql<{ tx: string; count: number }>`
                SELECT xmin::text AS tx, count(*)::int AS count
                  FROM ${sql(schema)}.jobs
                 WHERE queue = 'invitation-delivery'
                 GROUP BY xmin
                 ORDER BY count DESC`,
          ),
        );
        assert.deepStrictEqual(
          transactions.map(({ count }) => count),
          [EXPIRY_BATCH_SIZE, EXPIRY_BATCH_SIZE, rows - EXPIRY_BATCH_SIZE * 2],
        );
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('deletes terminal rows and jobs nothing ever claimed', () =>
      Effect.gen(function* () {
        yield* clear;
        // sign-in-email: retention 600 s, deletion 60 s — the queue whose
        // whole point is that its payload does not outlive the link.
        const signIn = resolvedQueue('sign-in-email');
        yield* enqueue('sign-in-email', {
          email: 'someone@example.test',
          url: 'https://studio.example.test/magic',
        });
        const abandoned = yield* enqueue('sign-in-email', {
          email: 'other@example.test',
          url: 'https://studio.example.test/other',
        });

        yield* onWorker((worker) =>
          Effect.gen(function* () {
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
          }),
        );
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('counts the queue by state', () =>
      Effect.gen(function* () {
        yield* clear;
        yield* enqueueDelivery('88888888-8888-4888-8888-888888888888');
        yield* enqueueDelivery('99999999-9999-4999-8999-999999999999');

        const depths = yield* onWorker((worker) =>
          Effect.gen(function* () {
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed<JobOutcome>('suppressed'),
            );
            yield* worker.drainOnce('invitation-delivery');
            return yield* worker.queueDepths;
          }),
        );

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
        const step = yield* drainDelivery(() =>
          Effect.succeed<JobOutcome>('uncertain'),
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

    it.effect('says out loud that an outcome was uncertain', () => {
      const logs = collectLeveledLogs();
      return Effect.gen(function* () {
        // Nothing sets a minimum log level, so Effect's own default of `Info`
        // decides what a deployment sees: a line written at debug is not
        // written at all. That is the whole of this case — an `uncertain`
        // outcome is the one a person has to look at, and it used to be logged
        // beside the two that are the queue working.
        yield* clear;
        yield* enqueueDelivery('cccccccc-3333-4333-8333-cccccccccccc');
        yield* drainDelivery(() =>
          Effect.succeed<JobOutcome>('completed'),
        ).pipe(Effect.provide(logs.layer));
        assert.deepStrictEqual(
          logs.lines,
          [],
          'an ordinary success reached the log a deployment reads',
        );

        yield* clear;
        const abandoned = yield* enqueueDelivery(
          'dddddddd-4444-4444-8444-dddddddddddd',
        );
        yield* drainDelivery(() =>
          Effect.succeed<JobOutcome>('uncertain'),
        ).pipe(Effect.provide(logs.layer));
        assert.deepStrictEqual(logs.lines, [
          {
            level: 'Warn',
            message: `job invitation-delivery ${abandoned} ended uncertain on attempt 1: a side effect left the process and its record could not be written`,
          },
        ]);
      }).pipe(Effect.provide(jobsLayer));
    });

    it.effect('says which attempts an operator has to act on', () => {
      const logs = collectLeveledLogs();
      return Effect.gen(function* () {
        yield* clear;
        const refused = () =>
          Effect.fail(new Error('SMTP refused the recipient'));

        const retried = yield* enqueueDelivery(
          'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
        );
        const retrying = yield* drainDelivery(refused).pipe(
          Effect.provide(logs.layer),
        );
        assert.strictEqual(retrying._tag, 'retrying');

        // The same failure on a job with no retries left. One line per job,
        // and the only difference between them is what is left to happen.
        yield* clear;
        const lost = yield* enqueueDelivery(
          'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
        );
        yield* updateJob(lost, 'retry_limit = 0');
        const failed = yield* drainDelivery(refused).pipe(
          Effect.provide(logs.layer),
        );
        assert.strictEqual(failed._tag, 'failed');

        // Which level the line is written at is the difference between an
        // operator noticing mail that will never be sent and not noticing it:
        // an attempt that will run again is the queue working, and one that
        // will not is a delivery someone has to re-send by hand (#1307).
        assert.deepStrictEqual(logs.lines, [
          {
            level: 'Warn',
            message: `job invitation-delivery ${retried} retrying after attempt 1: SMTP refused the recipient`,
          },
          {
            level: 'Error',
            message: `job invitation-delivery ${lost} failed on attempt 1: SMTP refused the recipient`,
          },
        ]);
      }).pipe(Effect.provide(jobsLayer));
    });

    it.effect('kills a job whose payload the queue does not declare', () =>
      Effect.gen(function* () {
        yield* clear;
        const { schema } = yield* QueueHarness;
        // A row written by an older release or by hand; the enqueue path
        // could not produce it.
        yield* asOwner(
          Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
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

        const step = yield* drainDelivery(() =>
          Effect.succeed<JobOutcome>('completed'),
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

// The graceful stop, which only a forked worker has: the two cases below let
// a real scope close while a handler is still running. What a *stopping*
// worker may claim is settle.test.ts's; that fetching is what stops it is
// there too.
describe.skipIf(!db)('the worker’s background fibers', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const jobsLayer = layerJobs;
    const clear = clearQueue;

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
        yield* enqueueDelivery();

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
        yield* enqueueDelivery();

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
