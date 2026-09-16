import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import {
  Cause,
  DateTime,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
} from 'effect';
import pg from 'pg';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { Database, withTransaction } from '../database.ts';
import { exitSqlState, isUniqueViolationCause } from '../errors.ts';
import { Jobs } from '../jobs.ts';
import { JobWorker, type JobOutcome } from '../worker.ts';
import {
  asApp,
  asOwner,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
} from './support.ts';

// The properties that only exist while two claims overlap. Every other suite in
// this directory drives `drainOnce` sequentially in one fiber, which is what
// buys them virtual time — and is also why `FOR UPDATE SKIP LOCKED`, the
// singleton `NOT EXISTS` guard and the `23505` a losing claim has to swallow
// survived the round-1 mutation run untouched: nothing was ever contended, so
// nothing could notice.
//
// So this file runs in *wall* time (`excludeTestServices: true`, as
// `notify.test.ts` does): a claim that waits on a lock waits on a real one, and
// the oracle is a real budget. The contention comes from a raw `pg` connection
// opened beside the queue's own pools — the harness's three `Database` values
// share nothing with it, which is the point: a second connection is the only
// way to hold a row lock the worker's claim then has to deal with.

const db = await reachableDb();

/**
 * How long the claim gets to step over a held row. Generous by three orders of
 * magnitude for the statement it actually runs; a claim that *waits* on the
 * held row cannot possibly beat it, because the holder is still holding.
 */
const CLAIM_BUDGET = Duration.seconds(2);

/**
 * When the holder lets go on its own. Only reached if a claim blocked: the
 * case below finishes long before it, and without it a blocked claim would
 * hold the file open until vitest's own timeout rather than failing an
 * assertion.
 */
const HOLDER_WATCHDOG = Duration.seconds(5);

/** How long two real workers get to finish a backlog between them. */
const DRAIN_BUDGET = Duration.seconds(20);

const CONDITION_POLL = Duration.millis(20);

/**
 * `listen: false` and a short poll rather than the schema's `NOTIFY`: a
 * listening worker reserves a pooled connection for its whole life
 * (`PgClient`'s `listenAcquirer`), and two of them on the harness's
 * four-connection maintenance client would spend half of it on something these
 * cases do not measure. What is being measured is what two workers do to one
 * table, not how quickly they hear about it.
 */
const BACKGROUND = {
  background: true,
  listen: false,
  pollInterval: Duration.millis(100),
  maxInFlight: 4,
} as const;

type Holder = {
  /** One statement on the held transaction. */
  readonly query: (
    statement: string,
    parameters?: readonly string[],
  ) => Effect.Effect<void>;
  /** How many backends are waiting on a lock this transaction holds. */
  readonly blockedByMe: Effect.Effect<number>;
  readonly finish: (how: 'COMMIT' | 'ROLLBACK') => Effect.Effect<void>;
};

/**
 * An open transaction on a connection of its own, for the length of `use`.
 * Always ended: a case that left a row locked would take every later case in
 * the file down with it, so the release rolls back whatever the case did not
 * finish itself.
 */
const holding = <A, E, R>(
  url: string,
  use: (holder: Holder) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const pool = new pg.Pool({ connectionString: url, max: 1 });
      // node-postgres turns an unhandled pool `error` into an uncaught
      // exception, which would take the whole run down rather than this case.
      pool.on('error', () => undefined);
      const client = await pool.connect();
      await client.query('BEGIN');
      return { pool, client };
    }),
    ({ client }) =>
      use({
        query: (statement, parameters) =>
          Effect.promise(async () => {
            await client.query(statement, parameters ? [...parameters] : []);
          }),
        blockedByMe: Effect.promise(async () => {
          // `pg_backend_pid()` runs on this connection, so this counts the
          // backends blocked by *this* transaction and nothing else.
          const { rows } = await client.query<{ blocked: number }>(
            `SELECT count(*)::int AS blocked
               FROM pg_stat_activity
              WHERE pg_backend_pid() = ANY(pg_blocking_pids(pid))`,
          );
          return rows[0]?.blocked ?? 0;
        }),
        finish: (how) =>
          Effect.promise(async () => {
            await client.query(how);
          }),
      }),
    ({ pool, client }) =>
      Effect.promise(async () => {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The case ended the transaction itself, or the connection is gone.
          // Either way the lock is released, which is all this is for.
        } finally {
          client.release();
          await pool.end();
        }
      }),
  );

/** Polls a condition until it holds, or answers `None` when the budget runs out. */
const awaitTrue = <E, R>(
  condition: Effect.Effect<boolean, E, R>,
  budget: Duration.Duration,
): Effect.Effect<Option.Option<void>, E, R> =>
  Effect.gen(function* () {
    let met = yield* condition;
    while (!met) {
      yield* Effect.sleep(CONDITION_POLL);
      met = yield* condition;
    }
  }).pipe(Effect.timeoutOption(budget));

describe.skipIf(!db)('the queue under real contention', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const jobsLayer = Layer.unwrap(
        Effect.map(QueueHarness, (harness) =>
          Jobs.layer({ schema: harness.schema }),
        ),
      );

      /**
       * Two of these, nested, are the two replicas the last two cases run.
       * Built fresh each time and provided with `local: true`, because a layer
       * is otherwise *shared* between `provide` calls — nesting one twice
       * would hand both scopes the same `JobWorker`, whose second `work()`
       * would overwrite the first's registry entry and leave the case
       * measuring one worker while claiming to measure two.
       */
      const backgroundWorker = () => layerWorker(BACKGROUND);

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

      const ownerSql = (statement: string) =>
        asOwner(Effect.flatMap(Database, ({ sql }) => sql.unsafe(statement)));

      const enqueueDelivery = (startAfter?: DateTime.Utc) =>
        Effect.flatMap(Jobs, (jobs) =>
          asApp(
            withTransaction(
              jobs.enqueue(
                'invitation-delivery',
                { deliveryId: randomUUID() },
                startAfter === undefined ? undefined : { startAfter },
              ),
            ),
          ),
        );

      const enqueueSweep = Effect.flatMap(Jobs, (jobs) =>
        asApp(withTransaction(jobs.enqueue('denied-attempts-summary', {}))),
      );

      /** Every row of a queue is terminal, and there are as many as expected. */
      const allCompleted = (queue: string, count: number) =>
        Effect.map(
          readJobs(queue),
          (rows) =>
            rows.length === count &&
            rows.every((row) => row.state === 'completed'),
        );

      it.effect(
        'claims past a row another transaction is holding rather than waiting on it',
        () =>
          Effect.gen(function* () {
            yield* clear;
            const { schema } = yield* QueueHarness;
            const now = yield* DateTime.now;
            // `run_at` decides which row the claim reaches first
            // (`ORDER BY run_at, created_at`), so the two are pinned twenty
            // seconds apart: without that the case would depend on two
            // enqueues landing in different milliseconds.
            const first = yield* enqueueDelivery(
              DateTime.subtractDuration(now, Duration.seconds(30)),
            );
            const second = yield* enqueueDelivery(
              DateTime.subtractDuration(now, Duration.seconds(10)),
            );

            yield* holding(db!.url, (holder) =>
              Effect.gen(function* () {
                yield* holder.query(
                  `SELECT id FROM ${schema}.jobs WHERE id = $1 FOR UPDATE`,
                  [first],
                );
                const watchdog = yield* Effect.forkChild(
                  Effect.flatMap(Effect.sleep(HOLDER_WATCHDOG), () =>
                    holder.finish('ROLLBACK'),
                  ),
                );

                const settled = yield* Effect.gen(function* () {
                  const worker = yield* JobWorker;
                  yield* worker.work('invitation-delivery', () =>
                    Effect.succeed<JobOutcome>('completed'),
                  );
                  return yield* Effect.timeoutOption(
                    worker.drainOnce('invitation-delivery'),
                    CLAIM_BUDGET,
                  );
                }).pipe(Effect.provide(layerWorker()));
                yield* Fiber.interrupt(watchdog);

                // The whole property: with `SKIP LOCKED` the claim steps over
                // the held row and settles the one behind it inside the
                // budget. With a plain `FOR UPDATE` the subquery blocks on the
                // held row until this transaction ends — which is after the
                // budget by construction — so either the budget runs out, or
                // the watchdog lets go and the claim takes the *held* job.
                // Both are refused below.
                if (Option.isNone(settled)) {
                  return assert.fail(
                    'the claim did not answer within its budget: it waited on the held row instead of skipping it',
                  );
                }
                const step = settled.value;
                if (step._tag !== 'settled') {
                  return assert.fail(
                    `the claim answered ${step._tag} rather than settling the unheld job`,
                  );
                }
                assert.strictEqual(
                  step.jobId,
                  second,
                  'the claim took the held job rather than the one behind it',
                );

                const rows = yield* readJobs('invitation-delivery');
                assert.strictEqual(
                  rows.find((row) => row.id === first)?.state,
                  'created',
                  'the held job was claimed while another transaction held its row',
                );
                assert.strictEqual(
                  rows.find((row) => row.id === second)?.state,
                  'completed',
                );
              }),
            );
          }).pipe(Effect.provide(jobsLayer)),
      );

      it.effect(
        'reads the singleton index’s unique violation as “another worker won”',
        () =>
          Effect.gen(function* () {
            yield* clear;
            const { schema } = yield* QueueHarness;
            const first = yield* enqueueSweep;
            const second = yield* enqueueSweep;

            yield* holding(db!.url, (holder) =>
              Effect.gen(function* () {
                // The claim's own UPDATE, run by hand and left uncommitted.
                // The `NOT EXISTS` guard reads committed state, so the worker
                // below passes it and meets `jobs_singleton_active_idx`
                // instead — which is the only way this port's swallow path is
                // ever reached.
                yield* holder.query(
                  `UPDATE ${schema}.jobs
                      SET state = 'active', attempts = 1,
                          locked_until = now() + interval '1 minute'
                    WHERE id = $1`,
                  [first],
                );

                const drain = yield* Effect.forkChild(
                  Effect.gen(function* () {
                    const worker = yield* JobWorker;
                    yield* worker.work('denied-attempts-summary', () =>
                      Effect.succeed<JobOutcome>('completed'),
                    );
                    return yield* Effect.exit(
                      worker.drainOnce('denied-attempts-summary'),
                    );
                  }).pipe(Effect.provide(layerWorker())),
                );

                // Not a sleep: committing before the claim is actually waiting
                // on this transaction's index entry would let the `NOT EXISTS`
                // guard see a committed `active` row and answer `idle` without
                // the index ever raising — the case would then pass for a
                // reason that has nothing to do with what it is named after.
                const blocked = yield* awaitTrue(
                  Effect.map(holder.blockedByMe, (count) => count > 0),
                  CLAIM_BUDGET,
                );
                assert.isTrue(
                  Option.isSome(blocked),
                  'the worker’s claim never blocked on the singleton index, so nothing raced',
                );

                yield* holder.finish('COMMIT');

                const exit = yield* Fiber.join(drain);
                if (Exit.isFailure(exit)) {
                  return assert.fail(
                    `the claim failed instead of yielding the race: ${Cause.pretty(exit.cause)}`,
                  );
                }
                assert.strictEqual(
                  exit.value._tag,
                  'idle',
                  'losing the race is “nothing to claim”, not a claim',
                );

                const rows = yield* readJobs('denied-attempts-summary');
                const winner = rows.find((row) => row.id === first);
                const loser = rows.find((row) => row.id === second);
                assert.strictEqual(winner?.state, 'active');
                assert.strictEqual(winner?.attempts, 1);
                assert.strictEqual(
                  loser?.state,
                  'created',
                  'the losing claim left its job claimable',
                );
                assert.strictEqual(
                  loser?.attempts,
                  0,
                  'the losing claim’s own transaction rolled back, so the attempt was not spent',
                );
              }),
            );
          }).pipe(Effect.provide(jobsLayer)),
      );

      it.effect('reads a real 23505 off a cause, and nothing else', () =>
        Effect.gen(function* () {
          const { schema } = yield* QueueHarness;
          yield* ownerSql(
            `CREATE TABLE IF NOT EXISTS ${schema}.unique_probe (k text PRIMARY KEY)`,
          );
          yield* ownerSql(`DELETE FROM ${schema}.unique_probe`);
          yield* ownerSql(
            `INSERT INTO ${schema}.unique_probe (k) VALUES ('once')`,
          );

          const duplicate = yield* Effect.exit(
            ownerSql(`INSERT INTO ${schema}.unique_probe (k) VALUES ('once')`),
          );
          if (Exit.isSuccess(duplicate)) {
            return assert.fail('the duplicate insert was accepted');
          }
          assert.strictEqual(
            exitSqlState(duplicate),
            '23505',
            'the probe did not produce a unique violation',
          );
          assert.isTrue(
            isUniqueViolationCause(duplicate.cause),
            'a real unique violation was not read as one',
          );

          // The other half. `22012` arrives wrapped in a `SqlError` of exactly
          // the same shape, so anything answering by the wrapper rather than by
          // the code would pass the case above and fail here.
          const divideByZero = yield* Effect.exit(ownerSql('SELECT 1 / 0'));
          if (Exit.isSuccess(divideByZero)) {
            return assert.fail('the database divided by zero');
          }
          assert.strictEqual(exitSqlState(divideByZero), '22012');
          assert.isFalse(isUniqueViolationCause(divideByZero.cause));
          assert.isFalse(
            isUniqueViolationCause(
              Cause.fail(new Error('nothing to do with Postgres')),
            ),
          );
        }),
      );

      it.effect('runs a backlog across two real workers, each job once', () =>
        Effect.gen(function* () {
          yield* clear;
          const count = 20;
          const ran: { readonly worker: string; readonly jobId: string }[] = [];
          const record = (which: string) => (job: { readonly id: string }) =>
            Effect.gen(function* () {
              ran.push({ worker: which, jobId: job.id });
              yield* Effect.sleep(Duration.millis(50));
              return 'completed' as const;
            });

          yield* Effect.gen(function* () {
            const first = yield* JobWorker;
            yield* Effect.gen(function* () {
              const second = yield* JobWorker;
              // Both handlers registered before anything is enqueued, so
              // neither worker gets a head start on the other.
              yield* first.work('invitation-delivery', record('first'));
              yield* second.work('invitation-delivery', record('second'));

              for (let index = 0; index < count; index += 1) {
                yield* enqueueDelivery();
              }

              const done = yield* awaitTrue(
                allCompleted('invitation-delivery', count),
                DRAIN_BUDGET,
              );
              assert.isTrue(
                Option.isSome(done),
                'two workers did not finish the backlog inside the budget',
              );
            }).pipe(Effect.provide(backgroundWorker(), { local: true }));
          }).pipe(Effect.provide(backgroundWorker(), { local: true }));

          assert.strictEqual(
            ran.length,
            count,
            'a job was handled more than once, or one was never handled',
          );
          assert.strictEqual(
            new Set(ran.map((entry) => entry.jobId)).size,
            count,
            'two workers handled the same job',
          );
          // If this one ever flakes under load it is the assertion to drop:
          // the two above are the safety property, this is only the evidence
          // that the case really was contended.
          assert.deepStrictEqual(
            [...new Set(ran.map((entry) => entry.worker))].sort(),
            ['first', 'second'],
            'only one of the two workers claimed anything',
          );
        }),
      );

      it.effect('never lets two singleton attempts overlap', () =>
        Effect.gen(function* () {
          yield* clear;
          const count = 5;
          const intervals: { readonly start: number; readonly end: number }[] =
            [];
          const record = Effect.gen(function* () {
            const start = yield* Effect.clockWith(
              (clock) => clock.currentTimeMillis,
            );
            yield* Effect.sleep(Duration.millis(100));
            const end = yield* Effect.clockWith(
              (clock) => clock.currentTimeMillis,
            );
            intervals.push({ start, end });
            return 'completed' as const;
          });

          yield* Effect.gen(function* () {
            const first = yield* JobWorker;
            yield* Effect.gen(function* () {
              const second = yield* JobWorker;
              yield* first.work('denied-attempts-summary', () => record);
              yield* second.work('denied-attempts-summary', () => record);

              for (let index = 0; index < count; index += 1) {
                yield* enqueueSweep;
              }

              const done = yield* awaitTrue(
                allCompleted('denied-attempts-summary', count),
                DRAIN_BUDGET,
              );
              assert.isTrue(
                Option.isSome(done),
                'the singleton backlog did not drain inside the budget',
              );
            }).pipe(Effect.provide(backgroundWorker(), { local: true }));
          }).pipe(Effect.provide(backgroundWorker(), { local: true }));

          assert.strictEqual(intervals.length, count);
          const ordered = [...intervals].sort(
            (left, right) => left.start - right.start,
          );
          for (let index = 1; index < ordered.length; index += 1) {
            assert.isAtLeast(
              ordered[index]!.start,
              ordered[index - 1]!.end,
              'two attempts on a singleton queue overlapped',
            );
          }
        }),
      );
    },
  );
});
