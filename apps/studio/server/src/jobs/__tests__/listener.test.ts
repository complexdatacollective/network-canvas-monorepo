import { assert, describe, layer } from '@effect/vitest';
import { Duration, Effect, Option } from 'effect';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { Database, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import { JobWorker } from '../worker.ts';
import {
  asApp,
  asOwner,
  layerQueueHarness,
  layerWorker,
  QueueHarness,
  readJobs,
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

const DELIVERY_ID = '44444444-4444-4444-8444-444444444444';

/** An hour, so nothing but a notification can explain a prompt drain. */
const POLL_INTERVAL = Duration.hours(1);

/** What the reconnected worker must beat. */
const BUDGET = Duration.millis(500);

/** Long enough for the worker's boot drain to have left the queue idle. */
const SETTLE = Duration.millis(150);

/** How long the reconnection is given; the backoff's first step is 200 ms. */
const RECONNECT_BUDGET = Duration.seconds(3);

type Backend = { readonly pid: number };

describe.skipIf(!db)('the job listener after its connection dies', () => {
  layer(layerQueueHarness(db!), { excludeTestServices: true })(
    'with the queue installed',
    (it) => {
      const clear = Effect.gen(function* () {
        const { schema } = yield* QueueHarness;
        yield* asOwner(
          Effect.flatMap(Database, ({ sql }) =>
            sql.unsafe(`DELETE FROM ${schema}.jobs`),
          ),
        );
      });

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
            Database,
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

      /** Waits until `read` answers something the case accepts, or gives up. */
      const awaitAnswer = <A, E, R>(
        read: Effect.Effect<A, E, R>,
        accept: (value: A) => boolean,
        within: Duration.Duration,
      ) =>
        Effect.gen(function* () {
          let answer = yield* read;
          while (!accept(answer)) {
            yield* Effect.sleep(Duration.millis(20));
            answer = yield* read;
          }
          return answer;
        }).pipe(Effect.timeoutOption(within));

      const awaitCompleted = Effect.gen(function* () {
        let settled = false;
        while (!settled) {
          const rows = yield* readJobs('invitation-delivery');
          settled = rows[0]?.state === 'completed';
          if (!settled) yield* Effect.sleep(Duration.millis(10));
        }
      }).pipe(Effect.timeoutOption(BUDGET));

      it.effect('reconnects and drains on a notification again', () =>
        Effect.gen(function* () {
          yield* clear;

          yield* Effect.gen(function* () {
            const worker = yield* JobWorker;
            yield* worker.work('invitation-delivery', () =>
              Effect.succeed('completed' as const),
            );
            yield* Effect.sleep(SETTLE);

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
                Database,
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
            yield* Effect.flatMap(Jobs, (jobs) =>
              asApp(
                withTransaction(
                  jobs.enqueue('invitation-delivery', {
                    deliveryId: DELIVERY_ID,
                  }),
                ),
              ),
            );
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
          }).pipe(
            Effect.provide(
              layerWorker({
                background: true,
                pollInterval: POLL_INTERVAL,
                listen: true,
              }),
            ),
          );
        }),
      );
    },
  );
});
