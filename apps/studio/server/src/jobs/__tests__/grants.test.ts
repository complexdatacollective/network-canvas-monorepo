import { assert, describe, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { Transaction, withTransaction } from '../database.ts';
import { exitSqlState, INSUFFICIENT_PRIVILEGE } from '../errors.ts';
import { Jobs } from '../jobs.ts';
import {
  asApp,
  asMaintenance,
  layerJobs,
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

// The SQLSTATE is read with the queue's own `exitSqlState` (errors.ts) rather
// than a reader of this suite's own: a refusal these cases name has to be the
// one the production code would classify, and two readers could disagree.

const db = await reachableDb();

describe.skipIf(!db)('what each role may do with a job', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const jobsLayer = layerJobs;

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
        assert.strictEqual(exitSqlState(payload), INSUFFICIENT_PRIVILEGE);

        const star = yield* asAppSql(
          (sql, schema) => sql`SELECT * FROM ${sql(schema)}.jobs`,
        );
        assert.strictEqual(exitSqlState(star), INSUFFICIENT_PRIVILEGE);

        const state = yield* asAppSql(
          (sql, schema) => sql`SELECT state FROM ${sql(schema)}.jobs`,
        );
        assert.strictEqual(exitSqlState(state), INSUFFICIENT_PRIVILEGE);

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
        assert.strictEqual(exitSqlState(claim), INSUFFICIENT_PRIVILEGE);

        const cancel = yield* asAppSql(
          (sql, schema) => sql`DELETE FROM ${sql(schema)}.jobs`,
        );
        assert.strictEqual(exitSqlState(cancel), INSUFFICIENT_PRIVILEGE);

        const schedules = yield* asAppSql(
          (sql, schema) => sql`SELECT * FROM ${sql(schema)}.job_schedules`,
        );
        assert.strictEqual(exitSqlState(schedules), INSUFFICIENT_PRIVILEGE);
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
