import { assert, describe, layer } from '@effect/vitest';
import { Duration, Effect, Option } from 'effect';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { readiness } from '../../http/health.ts';
import { jobsCheck } from '../readiness.ts';
import { JobWorker } from '../worker.ts';
import {
  asOwner,
  awaitAnswer,
  awaitJobState,
  clearQueue,
  enqueueDelivery,
  layerNotifiedWorker,
  layerQueueHarness,
  NOTIFY_BUDGET,
  NOTIFY_SETTLE,
  QueueHarness,
} from './support.ts';

const db = await reachableDb();

const RECONNECT_BUDGET = Duration.seconds(3);

type Backend = { readonly pid: number };

describe.skipIf(!db)('the job listener after its connection dies', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const clear = clearQueue;

      const listeners = Effect.fnUntraced(function* () {
        const { schema } = yield* QueueHarness;
        return yield* asOwner(
          Effect.flatMap(
            MaintenanceDatabase,
            ({ sql }) =>
              sql<Backend>`
                SELECT pid
                  FROM pg_stat_activity
                 WHERE datname = current_database()
                   AND query = ${`LISTEN "${schema}"`}
                   AND pid <> pg_backend_pid()`,
          ),
        );
      });

      const awaitCompleted = awaitJobState(
        'invitation-delivery',
        'completed',
        NOTIFY_BUDGET,
      );

      const terminateListener = Effect.gen(function* () {
        const before = yield* awaitAnswer(
          listeners(),
          (rows) => rows.length === 1,
          RECONNECT_BUDGET,
        );
        assert.isTrue(
          Option.isSome(before),
          'the worker never took a listening connection, so nothing below is evidence',
        );
        const pid = Option.getOrThrow(before)[0]!.pid;
        yield* asOwner(
          Effect.flatMap(
            MaintenanceDatabase,
            ({ sql }) =>
              sql<{
                terminated: boolean;
              }>`SELECT pg_terminate_backend(${pid}) AS terminated`,
          ),
        );
        return pid;
      });

      it.effect('reports the listener degraded until it is back', () =>
        Effect.gen(function* () {
          yield* clear;

          yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            const { maintenance } = yield* QueueHarness;
            const probe = readiness({ jobs: jobsCheck(worker, maintenance) });
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed('completed' as const),
            );
            yield* Effect.sleep(NOTIFY_SETTLE);

            const healthy = yield* awaitAnswer(
              probe,
              (result) => result.status === 'ok',
              RECONNECT_BUDGET,
            );
            assert.isTrue(
              Option.isSome(healthy),
              'the probe never read ok while the listener was up',
            );

            yield* terminateListener;

            const degraded = yield* awaitAnswer(
              probe,
              (result) => result.status !== 'ok',
              RECONNECT_BUDGET,
            );
            assert.isTrue(
              Option.isSome(degraded),
              'the probe never reported the listener down',
            );
            assert.deepStrictEqual(Option.getOrThrow(degraded), {
              status: 'degraded',
              checks: { jobs: 'degraded' },
            });

            const recovered = yield* awaitAnswer(
              probe,
              (result) => result.status === 'ok',
              RECONNECT_BUDGET,
            );
            assert.isTrue(
              Option.isSome(recovered),
              'the probe never saw the listener come back',
            );
          }).pipe(Effect.provide(layerNotifiedWorker(true)));
        }),
      );

      it.effect('reconnects and drains on a notification again', () =>
        Effect.gen(function* () {
          yield* clear;

          yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed('completed' as const),
            );
            yield* Effect.sleep(NOTIFY_SETTLE);

            const before = yield* awaitAnswer(
              listeners(),
              (rows) => rows.length === 1,
              RECONNECT_BUDGET,
            );
            assert.isTrue(
              Option.isSome(before),
              'the worker never took a listening connection, so nothing below is evidence',
            );
            const killed = Option.getOrThrow(before)[0]!.pid;

            yield* asOwner(
              Effect.flatMap(
                MaintenanceDatabase,
                ({ sql }) =>
                  sql<{
                    terminated: boolean;
                  }>`SELECT pg_terminate_backend(${killed}) AS terminated`,
              ),
            );

            const after = yield* awaitAnswer(
              listeners(),
              (rows) => rows.length === 1 && rows[0]!.pid !== killed,
              RECONNECT_BUDGET,
            );

            yield* enqueueDelivery();
            const settled = yield* awaitCompleted;
            assert.isTrue(
              Option.isSome(settled),
              'the worker did not drain within the budget, so it is still deaf',
            );
            assert.isTrue(
              Option.isSome(after),
              'the job drained without a listening backend being visible',
            );
            assert.notStrictEqual(Option.getOrThrow(after)[0]!.pid, killed);
          }).pipe(Effect.provide(layerNotifiedWorker(true)));
        }),
      );
    },
  );
});
