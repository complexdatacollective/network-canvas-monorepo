// What the enqueue freezes onto a job's row, measured in absolute terms.
//
// This file used to compare two enqueue paths column for column: the worker's
// `Jobs.enqueue` and a node-postgres twin (`src/jobs/client.ts`) that the web
// process used while its commands still ran on `pg.PoolClient`. That twin is
// gone — every command is an Effect on `Transaction` now — and with it the
// drift the comparison existed to catch, because there is one statement and
// one caller of it.
//
// What the comparison could never catch is what is left here: a `keep_until`
// BOTH paths would have got wrong the same way, since both rendered the same
// `insertJobStatement`. That is an absolute assertion against the declared
// retention, and it is the only enqueue oracle that has to be.
import { assert, layer } from '@effect/vitest';
import { Cause, DateTime, Effect, Exit } from 'effect';
import { describe } from 'vitest';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { resolvedQueue } from '../queues.ts';
import {
  asOwner,
  clearQueue,
  enqueue,
  layerJobs,
  layerQueueHarness,
  QueueHarness,
} from './support.ts';

const db = await reachableDb();

const QUEUE = 'invitation-delivery';
const DELIVERED_TO = '77777777-7777-4777-8777-777777777777';

/** An hour, comfortably longer than any clock difference in play. */
const DEFERRED_BY_SECONDS = 3600;

describe.skipIf(!db)('the enqueue', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (suite) => {
    suite.effect(
      'holds a deferred job for its whole retention after the instant it may run',
      () =>
        Effect.gen(function* () {
          yield* clearQueue;
          const { schema } = yield* QueueHarness;
          const startAfter = DateTime.addDuration(
            yield* DateTime.now,
            `${DEFERRED_BY_SECONDS} seconds`,
          );

          yield* enqueue(QUEUE, { deliveryId: DELIVERED_TO }, { startAfter });

          // Read as differences rather than as instants: `created_at` comes
          // from this process's corrected clock and `run_at` from the bound
          // `startAfter`, so absolute values would measure the clock rather
          // than the statement.
          const rows = yield* asOwner(
            Effect.flatMap(
              MaintenanceDatabase,
              ({ sql }) => sql<{
                deferred_by_seconds: number;
                retention_seconds: number;
              }>`
                SELECT extract(epoch FROM (run_at - created_at))::int
                         AS deferred_by_seconds,
                       extract(epoch FROM (keep_until - run_at))::int
                         AS retention_seconds
                  FROM ${sql(schema)}.jobs
                 WHERE queue = ${QUEUE}`,
            ),
          );

          assert.lengthOf(rows, 1);
          const row = rows[0]!;
          // The precondition, loosely: the two instants really are an hour
          // apart. Not asserted to the second, because one of them is a clock.
          assert.isAbove(row.deferred_by_seconds, DEFERRED_BY_SECONDS - 60);
          // The oracle, exactly. `keep_until` is the point a job nothing ever
          // claimed is DELETED at rather than retried (`schema.ts`,
          // `jobs_keep_until_idx`), so computing it from the creation instant
          // instead of the run instant would spend the retention window while
          // the job was still deferred — and a job deferred by longer than its
          // retention would be swept before it was ever claimable.
          //
          // Mutation: `${runAt} + ...` → `${createdAt} + ...` in `insert.ts`'s
          // `keep_until` expression. This then reports
          // `retention - DEFERRED_BY_SECONDS`.
          assert.strictEqual(
            row.retention_seconds,
            resolvedQueue(QUEUE).retentionSeconds,
          );
        }).pipe(Effect.provide(layerJobs)),
      { timeout: 30_000 },
    );

    suite.effect('dies rather than enqueue onto a queue nothing declares', () =>
      Effect.gen(function* () {
        yield* clearQueue;
        // Only a caller that has bypassed the types reaches this, which is
        // exactly when a run-time refusal is worth having — and it is a
        // DEFECT rather than a failure, because a caller inside a
        // transaction has nothing it could usefully do about a queue name
        // its own build does not carry.
        const outcome = yield* Effect.exit(
          enqueue('invitation-delivery-typo' as typeof QUEUE, {
            deliveryId: DELIVERED_TO,
          }),
        );
        assert.isTrue(Exit.isFailure(outcome));
        assert.isTrue(Exit.isFailure(outcome) && Cause.hasDies(outcome.cause));
      }).pipe(Effect.provide(layerJobs)),
    );
  });
});
