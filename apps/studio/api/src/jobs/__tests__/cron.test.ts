import { assert, describe, layer } from '@effect/vitest';
import { Cron, DateTime, Duration, Effect, Exit } from 'effect';
import { TestClock } from 'effect/testing';

import { JOB_SCHEDULES } from '@codaco/studio-sync/jobs';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { JobWorker } from '../worker.ts';
import {
  asOwner,
  clearQueue,
  DELIVERY_ID,
  holding,
  layerJobs,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
  readSchedules,
} from './support.ts';

const db = await reachableDb();

const EVERY_MINUTE = '* * * * *';
const HOURLY = '0 * * * *';
const CHANGED = '30 4 * * *';

const CRON_LOCK_CLASS = 402177;

const withExcessField = Object.assign(
  { deliveryId: DELIVERY_ID },
  { teamId: 'a-team' },
);

const holdingCronLock = <A, E, R>(
  schemaName: string,
  body: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  holding(db!.url, (holder) =>
    Effect.flatMap(
      holder.query(
        'select pg_advisory_xact_lock($1::int, hashtext($2::text))',
        [String(CRON_LOCK_CLASS), schemaName],
      ),
      () => body,
    ),
  );

describe.skipIf(!db)('recurring work', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const clear = clearQueue;
    const jobsLayer = layerJobs;
    const schedules = readSchedules;

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
          assert.strictEqual(row?.next_run_at.getTime(), boundary.getTime());

          yield* TestClock.setTime(boundary.getTime() - 1000);
          assert.isTrue(yield* worker.tickSchedules);
          assert.deepStrictEqual(yield* readJobs('protocol-store-gc'), []);

          yield* TestClock.setTime(boundary.getTime());
          assert.isTrue(yield* worker.tickSchedules);
          const created = yield* readJobs('protocol-store-gc');
          assert.strictEqual(created.length, 1);
          assert.strictEqual(created[0]?.state, 'created');

          const [advanced] = yield* schedules();
          assert.strictEqual(
            advanced?.next_run_at.getTime(),
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
          yield* TestClock.setTime(row!.next_run_at.getTime());

          return yield* Effect.gen(function* () {
            const second = yield* JobWorker;
            return yield* Effect.all(
              [first.tickSchedules, second.tickSchedules],
              { concurrency: 2 },
            );
          }).pipe(Effect.provide(layerWorker()));
        }).pipe(Effect.provide(layerWorker()));

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
        yield* TestClock.setTime(row!.next_run_at.getTime());

        assert.isTrue(
          yield* holdingCronLock(`${schema}_other`, worker.tickSchedules),
        );
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

    it.effect('refuses to register a schedule whose payload grew a field', () =>
      Effect.gen(function* () {
        yield* clear;

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;
          const refused = yield* Effect.exit(
            worker.schedule(
              'grown',
              EVERY_MINUTE,
              'invitation-delivery',
              withExcessField,
            ),
          );
          assert.isTrue(Exit.isFailure(refused));
          assert.deepStrictEqual(yield* schedules(), []);

          yield* worker.schedule('grown', EVERY_MINUTE, 'invitation-delivery', {
            deliveryId: DELIVERY_ID,
          });
          assert.strictEqual((yield* schedules()).length, 1);
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('enqueues nothing from a schedule row that grew a field', () =>
      Effect.gen(function* () {
        const { schema } = yield* QueueHarness;
        const writeDueRow = (payload: object) =>
          asOwner(
            Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
              sql.unsafe(
                `INSERT INTO ${schema}.job_schedules
                   (name, cron, queue, payload, next_run_at)
                 VALUES ('hand-written', $1, 'invitation-delivery', $2::jsonb,
                         to_timestamp(0))`,
                [EVERY_MINUTE, JSON.stringify(payload)],
              ),
            ),
          );

        yield* Effect.gen(function* () {
          const worker = yield* JobWorker;

          yield* clear;
          yield* writeDueRow({ deliveryId: DELIVERY_ID });
          yield* Effect.exit(worker.tickSchedules);
          assert.strictEqual(
            (yield* readJobs('invitation-delivery')).length,
            1,
          );

          yield* clear;
          yield* writeDueRow(withExcessField);
          yield* Effect.exit(worker.tickSchedules);
          assert.deepStrictEqual(yield* readJobs('invitation-delivery'), []);
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
          yield* TestClock.setTime(row!.next_run_at.getTime());
          assert.isTrue(yield* worker.tickSchedules);

          yield* TestClock.adjust(Duration.minutes(1));
          assert.isTrue(yield* worker.tickSchedules);
          assert.strictEqual(
            (yield* readJobs('denied-attempts-summary')).length,
            1,
          );
        }).pipe(Effect.provide(layerWorker()));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect(
      'registers the sweep once however many replicas boot, leaving a due one where it is',
      () =>
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

            yield* TestClock.setTime(registered!.next_run_at.getTime());

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
            assert.strictEqual(
              rows[0]?.next_run_at.getTime(),
              registered!.next_run_at.getTime(),
            );
            assert.deepStrictEqual(yield* readJobs('protocol-store-gc'), []);

            const now = yield* DateTime.now;
            yield* first.schedule(
              'protocol-store-gc',
              CHANGED,
              'protocol-store-gc',
              {},
            );
            const [changed] = yield* schedules();
            assert.strictEqual(changed?.cron, CHANGED);
            assert.strictEqual(
              changed?.next_run_at.getTime(),
              Cron.next(
                Cron.parseUnsafe(CHANGED, 'UTC'),
                DateTime.toDate(now),
              ).getTime(),
            );
          }).pipe(Effect.provide(layerWorker()));
        }).pipe(Effect.provide(jobsLayer)),
    );
  });
});
