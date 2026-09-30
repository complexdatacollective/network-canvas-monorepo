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

// What happens to the worker's one `LISTEN` when its connection dies.
//
// `notify.test.ts` proves the listener works; this file proves it survives.
// The failure it guards is silent by construction: `PgConnection.fatal` fails
// every listen queue with `Cause.interrupt()`, so a take loop with no retry
// simply ends — no log line, no metric, no lost job, just the two queues that
// declare `notify` (the two where a person is waiting) quietly falling back to
// the poll interval for the rest of the process's life.
//
// Real time, like `notify.test.ts`, and the same oracle: with the poll
// interval an hour away, only a live listener can explain a job settling
// inside 500 ms. The connection is killed from a *different* connection with
// `pg_terminate_backend`, which is what a database restart, a connection
// timeout or an operator does.

const db = await reachableDb();

/** How long the reconnection is given; the backoff's first step is 200 ms. */
const RECONNECT_BUDGET = Duration.seconds(3);

type Backend = { readonly pid: number };

describe.skipIf(!db)('the job listener after its connection dies', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const clear = clearQueue;

      /**
       * Every backend currently listening on this suite's channel, read from
       * the owner's own connection. `pg_listening_channels()` only answers for
       * the session that calls it, so the evidence is the listener's last
       * statement instead: `sql.listen` issues `LISTEN "<channel>"` and
       * nothing else on the connection it reserves, and the channel is this
       * suite's own scratch schema, so no other suite's listener can match.
       */
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

      /** Kills the one backend holding this suite's `LISTEN`, and says which. */
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
            // A queue this replica works: a poll fiber skips a queue with no
            // handler, and it is the first answered claim that makes the
            // worker ready at all.
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed('completed' as const),
            );
            yield* Effect.sleep(NOTIFY_SETTLE);

            // The baseline: without it, `degraded` below could be a probe that
            // has simply never seen a listener rather than one reporting a
            // listener that went away.
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

            // What an operator has instead of counting warning lines: the
            // listener is down, the worker still claims on its poll interval,
            // and the verdict says which of those two things is true.
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

            // And it goes back on its own, without the probe being told
            // anything: the reconnection is what clears it.
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

            // What a database restart or an idle-connection reaper does. The
            // take loop ends here with no error of its own.
            yield* asOwner(
              Effect.flatMap(
                MaintenanceDatabase,
                ({ sql }) =>
                  sql<{
                    terminated: boolean;
                  }>`SELECT pg_terminate_backend(${killed}) AS terminated`,
              ),
            );

            // Waited for rather than asserted on, because the assertion that
            // matters is the drain below: a `NOTIFY` with nothing listening is
            // dropped, so the job has to be enqueued on the far side of the
            // reconnection for the budget to mean anything.
            const after = yield* awaitAnswer(
              listeners(),
              (rows) => rows.length === 1 && rows[0]!.pid !== killed,
              RECONNECT_BUDGET,
            );

            // The same oracle notify.test.ts uses, now on the far side of a
            // reconnection: an hour-long poll interval means only a live
            // listener can explain this.
            yield* enqueueDelivery();
            const settled = yield* awaitCompleted;
            assert.isTrue(
              Option.isSome(settled),
              'the worker did not drain within the budget, so it is still deaf',
            );
            // And the drain came from a connection that is not the dead one.
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
