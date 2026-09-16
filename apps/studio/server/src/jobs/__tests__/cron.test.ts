import { assert, describe, layer } from '@effect/vitest';
import { Cron, DateTime, Duration, Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import pg from 'pg';

import { JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../__tests__/support/postgres.ts';
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

/**
 * The cron lock's class constant, pinned to `worker.ts`'s: the second half of
 * the case below fails if the two drift, so the pin checks itself.
 */
const CRON_LOCK_CLASS = 402177;

/**
 * Holds the cron lock for `schemaName` on a connection of its own for the
 * duration of `body` — a second replica's tick, or another schema's, frozen
 * mid-tick. A raw client rather than an Effect transaction, because an open
 * Effect transaction on this fiber would route the worker's own statements
 * onto the holder's connection and the lock would be its own.
 */
const holdingCronLock = <A, E, R>(
  schemaName: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.promise(async () => {
      const client = new pg.Client({ connectionString: db!.url });
      await client.connect();
      await client.query('begin');
      await client.query(
        'select pg_advisory_xact_lock($1::int, hashtext($2::text))',
        [CRON_LOCK_CLASS, schemaName],
      );
      return client;
    }),
    () => body,
    (client) =>
      Effect.promise(async () => {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }),
  );

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
        assert.deepStrictEqual(
          [...outcomes].sort((a, b) => Number(a) - Number(b)),
          [false, true],
        );
        const created = yield* readJobs('denied-attempts-summary');
        assert.strictEqual(created.length, 1);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('contends only with a tick on its own schema', () =>
      Effect.gen(function* () {
        yield* clear;
        const { schema } = yield* QueueHarness;
        const worker = yield* JobWorker;
        yield* worker.schedule(
          'denied-attempts-summary',
          EVERY_MINUTE,
          'denied-attempts-summary',
          {},
        );
        const [row] = yield* schedules();
        yield* TestClock.setTime(row!.next_run_at);

        // Another schema's tick in flight — production's `studio_jobs` beside
        // a suite's scratch schema on a shared cluster, or two suites side by
        // side — holds a key of its own and does not stop this one.
        assert.isTrue(
          yield* holdingCronLock(`${schema}_other`, worker.tickSchedules),
        );
        // A holder of this schema's key is exactly the other replica the lock
        // exists for, and this tick is refused.
        assert.isFalse(yield* holdingCronLock(schema, worker.tickSchedules));

        const created = yield* readJobs('denied-attempts-summary');
        assert.strictEqual(created.length, 1);
      })
        .pipe(Effect.provide(layerWorker()))
        .pipe(Effect.provide(jobsLayer)),
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
            JOB_SCHEDULES.map(({ queue }) => queue).sort(),
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

    it.effect('registers the sweep once however many replicas boot', () =>
      Effect.gen(function* () {
        yield* clear;

        yield* Effect.gen(function* () {
          const first = yield* JobWorker;
          yield* first.schedule(
            'protocol-store-gc',
            HOURLY,
            'protocol-store-gc',
            {},
          );
          const [registered] = yield* schedules();
          assert.strictEqual(registered?.cron, HOURLY);

          // The occurrence has come due and nothing has ticked it yet, which
          // is the window a rolling restart lands in.
          yield* TestClock.setTime(registered!.next_run_at);

          // A second replica registers the same declaration. Both write the
          // same row — `ON CONFLICT (name)` — so a deployment of any size
          // still fires one sweep an hour rather than one per replica.
          yield* Effect.gen(function* () {
            const second = yield* JobWorker;
            yield* second.schedule(
              'protocol-store-gc',
              HOURLY,
              'protocol-store-gc',
              {},
            );
          }).pipe(Effect.provide(layerWorker()));

          const rows = yield* schedules();
          assert.strictEqual(rows.length, 1);
          // And it left the due time where it was: recomputing it on every
          // boot would push this occurrence a whole hour forward, so a replica
          // restarting in this window would skip the sweep entirely. That a
          // due time fires is the first case above; this is that it survives.
          assert.strictEqual(rows[0]?.next_run_at, registered!.next_run_at);
          assert.deepStrictEqual(yield* readJobs('protocol-store-gc'), []);
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );
  });
});
