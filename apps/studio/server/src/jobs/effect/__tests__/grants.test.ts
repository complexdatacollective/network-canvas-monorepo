import { assert, describe, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Layer, Option, Predicate } from 'effect';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { Transaction, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import {
  asApp,
  asMaintenance,
  layerQueueHarness,
  QueueHarness,
  readJobs,
} from './support.ts';

// The role boundary, on a real Postgres. The application may create a job and
// learn its id, and nothing more: it cannot read a payload, claim a job, or
// change one. This is the objection that kept Studio off a queue library at
// all (#1895) — the job table is one table for every team, so a role that can
// read it can read every team's queued work.
//
// The role is pinned with `set local role` rather than a startup parameter,
// because `@effect/sql-pg` rc.115 has none (see database.ts). That is exactly
// what these cases exercise: the grants bite because the transaction is
// running as `studio_app`.

const db = await reachableDb();

/** Insufficient privilege. */
const INSUFFICIENT_PRIVILEGE = '42501';

const sqlState = (exit: Exit.Exit<unknown, unknown>): string | undefined => {
  if (Exit.isSuccess(exit)) return undefined;
  let current: unknown = Option.getOrUndefined(
    Cause.findErrorOption(exit.cause),
  );
  while (Predicate.isObject(current)) {
    if (
      Predicate.hasProperty(current, 'code') &&
      Predicate.isString(current.code)
    ) {
      return current.code;
    }
    if (!Predicate.hasProperty(current, 'cause')) return undefined;
    current = current.cause;
  }
  return undefined;
};

describe.skipIf(!db)('what each role may do with a job', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const jobsLayer = Layer.unwrap(
      Effect.map(QueueHarness, (harness) =>
        Jobs.layer({ schema: harness.schema }),
      ),
    );

    const asAppSql = <A>(
      run: (
        sql: Transaction['Service']['sql'],
        schema: string,
      ) => Effect.Effect<A, unknown>,
    ) =>
      Effect.flatMap(QueueHarness, ({ schema }) =>
        Effect.exit(
          asApp(
            withTransaction(
              Effect.flatMap(Transaction, ({ sql }) => run(sql, schema)),
            ),
          ),
        ),
      );

    it.effect('lets the application create a job and read back its id', () =>
      Effect.gen(function* () {
        const jobs = yield* Jobs;
        const id = yield* asApp(
          withTransaction(
            jobs.enqueue('invitation-delivery', {
              deliveryId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            }),
          ),
        );
        assert.isString(id);
        // The owner can see it; the application that wrote it cannot read it
        // back, which the next case proves.
        assert.strictEqual((yield* readJobs('invitation-delivery')).length, 1);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('refuses the application every column but the id', () =>
      Effect.gen(function* () {
        const payload = yield* asAppSql(
          (sql, schema) => sql`SELECT payload FROM ${sql(schema)}.jobs`,
        );
        assert.strictEqual(sqlState(payload), INSUFFICIENT_PRIVILEGE);

        const star = yield* asAppSql(
          (sql, schema) => sql`SELECT * FROM ${sql(schema)}.jobs`,
        );
        assert.strictEqual(sqlState(star), INSUFFICIENT_PRIVILEGE);

        const state = yield* asAppSql(
          (sql, schema) => sql`SELECT state FROM ${sql(schema)}.jobs`,
        );
        assert.strictEqual(sqlState(state), INSUFFICIENT_PRIVILEGE);

        // The one column it may read, so the three refusals above are not an
        // artefact of the table being unreadable altogether.
        const ids = yield* asAppSql(
          (sql, schema) => sql`SELECT id FROM ${sql(schema)}.jobs`,
        );
        assert.isTrue(Exit.isSuccess(ids));
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('refuses the application a claim, an update or a delete', () =>
      Effect.gen(function* () {
        const claim = yield* asAppSql(
          (sql, schema) => sql`
            UPDATE ${sql(schema)}.jobs SET state = 'active'
             WHERE id = (SELECT id FROM ${sql(schema)}.jobs
                          FOR UPDATE SKIP LOCKED LIMIT 1)`,
        );
        assert.strictEqual(sqlState(claim), INSUFFICIENT_PRIVILEGE);

        const cancel = yield* asAppSql(
          (sql, schema) => sql`DELETE FROM ${sql(schema)}.jobs`,
        );
        assert.strictEqual(sqlState(cancel), INSUFFICIENT_PRIVILEGE);

        const schedules = yield* asAppSql(
          (sql, schema) => sql`SELECT * FROM ${sql(schema)}.job_schedules`,
        );
        assert.strictEqual(sqlState(schedules), INSUFFICIENT_PRIVILEGE);
      }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect('lets maintenance do all of it', () =>
      Effect.gen(function* () {
        const { schema } = yield* QueueHarness;
        const read = yield* Effect.exit(
          asMaintenance(
            withTransaction(
              Effect.flatMap(
                Transaction,
                ({ sql }) => sql`SELECT * FROM ${sql(schema)}.jobs`,
              ),
            ),
          ),
        );
        assert.isTrue(Exit.isSuccess(read));

        const claim = yield* Effect.exit(
          asMaintenance(
            withTransaction(
              Effect.flatMap(
                Transaction,
                ({ sql }) =>
                  sql`UPDATE ${sql(schema)}.jobs SET last_error = 'maintenance was here'`,
              ),
            ),
          ),
        );
        assert.isTrue(Exit.isSuccess(claim));
      }).pipe(Effect.provide(jobsLayer)),
    );
  });
});
