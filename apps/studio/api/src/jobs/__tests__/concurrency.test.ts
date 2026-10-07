import { randomUUID } from 'node:crypto';

import { assert, describe, layer } from '@effect/vitest';
import { Cause, DateTime, Duration, Effect, Exit, Fiber, Option } from 'effect';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { exitSqlState, isUniqueViolationCause } from '../errors.ts';
import { JobWorker, type JobOutcome } from '../worker.ts';
import {
  asOwner,
  awaitTrue,
  holding,
  clearQueue,
  enqueueDelivery,
  enqueueSweep,
  layerJobs,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
} from './support.ts';

const db = await reachableDb();

const CLAIM_BUDGET = Duration.seconds(2);

const HOLDER_WATCHDOG = Duration.seconds(5);

const DRAIN_BUDGET = Duration.seconds(20);

const BACKGROUND = {
  background: true,
  listen: false,
  pollInterval: Duration.millis(100),
  maxInFlight: 4,
} as const;

describe.skipIf(!db)('the queue under real contention', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const jobsLayer = layerJobs;

      const backgroundWorker = () => layerWorker(BACKGROUND);

      const clear = clearQueue;

      const ownerSql = (statement: string) =>
        asOwner(
          Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
            sql.unsafe(statement),
          ),
        );

      const enqueueAt = (startAfter?: DateTime.Utc) =>
        enqueueDelivery(
          randomUUID(),
          startAfter === undefined ? undefined : { startAfter },
        );

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
            const first = yield* enqueueAt(
              DateTime.subtractDuration(now, Duration.seconds(30)),
            );
            const second = yield* enqueueAt(
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
              yield* first.work('invitation-delivery', record('first'));
              yield* second.work('invitation-delivery', record('second'));

              for (let index = 0; index < count; index += 1) {
                yield* enqueueAt();
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
