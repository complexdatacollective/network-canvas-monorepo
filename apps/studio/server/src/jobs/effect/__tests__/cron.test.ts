import { assert, describe, layer } from '@effect/vitest';
import { Cron, DateTime, Duration, Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';

import { JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { Database } from '../database.ts';
import { Jobs } from '../jobs.ts';
import { JobWorker } from '../worker.ts';
import {
  asOwner,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
} from './support.ts';

// Recurring work: the declarations become rows, the rows come due on the
// cron's own boundary, one replica ticks, and a row this build did not declare
// is removed rather than left creating jobs on a queue nothing works.

const db = await reachableDb();

/** `denied-attempts-summary`, every minute — the tighter of the two. */
const EVERY_MINUTE = '* * * * *';
/** `protocol-store-gc`, hourly. */
const HOURLY = '0 * * * *';

describe.skipIf(!db)('recurring work', () => {
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

    const schedules = Effect.fnUntraced(function* () {
      const { schema } = yield* QueueHarness;
      return yield* asOwner(
        Effect.flatMap(
          Database,
          ({ sql }) =>
            sql<{
              name: string;
              cron: string;
              queue: string;
              next_run_at: number;
            }>`SELECT name, cron, queue, next_run_at FROM ${sql(schema)}.job_schedules ORDER BY name`,
        ),
      );
    });

    it.effect('creates a job on the cron’s boundary and not before', () =>
      Effect.gen(function* () {
        yield* clear;

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.schedule(
            'protocol-store-gc',
            HOURLY,
            'protocol-store-gc',
            {},
          );

          const now = yield* DateTime.now;
          const boundary = Cron.next(
            Cron.parseUnsafe(HOURLY, 'UTC'),
            DateTime.toDate(now),
          );
          const [row] = yield* schedules();
          assert.strictEqual(row?.next_run_at, boundary.getTime());

          // A second before the boundary: nothing is due.
          yield* TestClock.setTime(boundary.getTime() - 1000);
          assert.isTrue(yield* worker.tickSchedules);
          assert.deepStrictEqual(yield* readJobs('protocol-store-gc'), []);

          // On it: one job, and the schedule has moved to the next boundary.
          yield* TestClock.setTime(boundary.getTime());
          assert.isTrue(yield* worker.tickSchedules);
          const created = yield* readJobs('protocol-store-gc');
          assert.strictEqual(created.length, 1);
          assert.strictEqual(created[0]?.state, 'created');

          const [advanced] = yield* schedules();
          assert.strictEqual(
            advanced?.next_run_at,
            Cron.next(Cron.parseUnsafe(HOURLY, 'UTC'), boundary).getTime(),
          );
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('lets only one of two workers tick', () =>
      Effect.gen(function* () {
        yield* clear;

        const outcomes = yield* Effect.gen(function* () {
          const first = yield* JobWorker;
          yield* first.schedule(
            'denied-attempts-summary',
            EVERY_MINUTE,
            'denied-attempts-summary',
            {},
          );
          const [row] = yield* schedules();
          yield* TestClock.setTime(row!.next_run_at);

          // Two workers on one schema, exactly as two replicas are. The second
          // is built under its own layer so it is a different service value
          // with its own client, not the same one twice.
          return yield* Effect.gen(function* () {
            const second = yield* JobWorker;
            // Run them together: the advisory lock is what decides, and the
            // loser must say so rather than enqueue a second job.
            return yield* Effect.all(
              [first.tickSchedules, second.tickSchedules],
              { concurrency: 2 },
            );
          }).pipe(Effect.provide(layerWorker()));
        }).pipe(Effect.provide(layerWorker()));

        // One ticked, one was refused the lock.
        assert.deepStrictEqual([...outcomes].sort(), [false, true]);
        const created = yield* readJobs('denied-attempts-summary');
        assert.strictEqual(created.length, 1);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('drops a schedule row this build does not declare', () =>
      Effect.gen(function* () {
        yield* clear;

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          for (const { queue, cron } of JOB_SCHEDULES) {
            yield* worker.schedule(queue, cron, queue, {});
          }
          // What a previous release left: a row on a queue this worker
          // registers no handler for, coming due every minute forever.
          yield* worker.schedule(
            'retired-sweep',
            EVERY_MINUTE,
            'protocol-store-gc',
            {},
          );
          assert.strictEqual((yield* schedules()).length, 3);

          const dropped = yield* worker.dropUndeclaredSchedules(
            JOB_SCHEDULES.map(({ queue }) => queue),
          );
          assert.deepStrictEqual(dropped, ['retired-sweep']);
          assert.deepStrictEqual(
            (yield* schedules()).map(({ name }) => name).sort(),
            [...JOB_SCHEDULES.map(({ queue }) => queue)].sort(),
          );
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('does not double up a singleton schedule’s job', () =>
      Effect.gen(function* () {
        yield* clear;

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          yield* worker.schedule(
            'denied-attempts-summary',
            EVERY_MINUTE,
            'denied-attempts-summary',
            {},
          );
          const [row] = yield* schedules();
          yield* TestClock.setTime(row!.next_run_at);
          assert.isTrue(yield* worker.tickSchedules);

          // The minute after, with the first run still queued. The queue is
          // `singleton`, so the tick's enqueue is refused — and the tick still
          // advances, which is what "a missed minute is picked up by the next
          // run" means.
          yield* TestClock.adjust(Duration.minutes(1));
          assert.isTrue(yield* worker.tickSchedules);
          assert.strictEqual(
            (yield* readJobs('denied-attempts-summary')).length,
            1,
          );
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );
  });
});
