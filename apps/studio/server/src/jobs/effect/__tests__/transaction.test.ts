import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Exit, Layer } from 'effect';

import { reachableDb } from '../../../__tests__/support/postgres.ts';
import { Database, Transaction, withTransaction } from '../database.ts';
import { Jobs } from '../jobs.ts';
import {
  asApp,
  asOwner,
  layerQueueHarness,
  QueueHarness,
  readJobs,
} from './support.ts';

// The transaction guarantee, which is the spike's reason to exist: a domain
// change and the job it schedules are committed together or not at all.
//
// Three oracles, in order of strength:
//
//  1. Invisibility. While the caller's transaction is still open, a *second*
//     connection cannot see the job row. This is what "in the transaction"
//     means, and nothing weaker proves it: a job written on a pool connection
//     of its own would be visible immediately.
//  2. Rollback and commit. Failing the body leaves zero domain rows and zero
//     job rows; succeeding leaves one and one.
//  3. The same backend. `pg_backend_pid()` inside the transaction equals the
//     pid the domain insert ran on — measured while a second connection holds
//     a different pid, so the equality is not an artefact of a pool that only
//     ever had one connection open.
//
// And the type-level half: `Jobs.enqueue` outside a transaction does not
// compile, which is the only reason the three above can be the whole story.

const db = await reachableDb();

describe.skipIf(!db)('the transaction guarantee', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (it) => {
    const DOMAIN_TABLE = 'spike_domain';

    const withDomainTable = Effect.gen(function* () {
      const { schema } = yield* QueueHarness;
      yield* asOwner(
        Effect.flatMap(Database, ({ sql }) =>
          sql.unsafe(
            `CREATE TABLE IF NOT EXISTS ${schema}.${DOMAIN_TABLE} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note text NOT NULL)`,
          ),
        ),
      );
      yield* asOwner(
        Effect.flatMap(Database, ({ sql }) =>
          sql.unsafe(
            `GRANT INSERT, SELECT, DELETE ON ${schema}.${DOMAIN_TABLE} TO studio_app`,
          ),
        ),
      );
      yield* asOwner(
        Effect.flatMap(Database, ({ sql }) =>
          sql.unsafe(`DELETE FROM ${schema}.${DOMAIN_TABLE}`),
        ),
      );
      yield* asOwner(
        Effect.flatMap(Database, ({ sql }) =>
          sql.unsafe(`DELETE FROM ${schema}.jobs`),
        ),
      );
      return schema;
    });

    const countDomainRows = Effect.fnUntraced(function* () {
      const { schema } = yield* QueueHarness;
      const rows = yield* asOwner(
        Effect.flatMap(
          Database,
          ({ sql }) =>
            sql<{
              count: number;
            }>`SELECT count(*)::int AS count FROM ${sql(schema)}.${sql(DOMAIN_TABLE)}`,
        ),
      );
      return rows[0]?.count ?? 0;
    });

    const jobsLayer = Layer.unwrap(
      Effect.map(QueueHarness, (harness) =>
        Jobs.layer({ schema: harness.schema }),
      ),
    );

    it.effect(
      'commits a domain row and its job together, or neither',
      () =>
        Effect.gen(function* () {
          const schema = yield* withDomainTable;
          const jobs = yield* Jobs;
          const deliveryId = '11111111-1111-4111-8111-111111111111';

          const write = (note: string) =>
            Effect.gen(function* () {
              const { sql } = yield* Transaction;
              yield* sql.unsafe(
                `INSERT INTO ${schema}.${DOMAIN_TABLE} (note) VALUES ($1)`,
                [note],
              );
              return yield* jobs.enqueue('invitation-delivery', { deliveryId });
            });

          // Rollback: the body fails after both writes.
          const rolledBack = yield* Effect.exit(
            asApp(
              withTransaction(
                Effect.flatMap(write('rolled back'), () =>
                  Effect.fail('roll back command' as const),
                ),
              ),
            ),
          );
          assert.isTrue(Exit.isFailure(rolledBack));
          assert.strictEqual(yield* countDomainRows(), 0);
          assert.deepStrictEqual(yield* readJobs(), []);

          // Commit: the same body, allowed to finish.
          const jobId = yield* asApp(withTransaction(write('committed')));
          assert.strictEqual(yield* countDomainRows(), 1);
          const queued = yield* readJobs();
          assert.strictEqual(queued.length, 1);
          assert.strictEqual(queued[0]?.id, jobId);
          assert.strictEqual(queued[0]?.state, 'created');
          assert.deepStrictEqual(queued[0]?.payload, { deliveryId });
        }).pipe(Effect.provide(jobsLayer)),
      { timeout: 30_000 },
    );

    it.effect(
      'hides the job from every other connection until the commit',
      () =>
        Effect.gen(function* () {
          const schema = yield* withDomainTable;
          const jobs = yield* Jobs;
          const deliveryId = '22222222-2222-4222-8222-222222222222';

          // The oracle that cannot be satisfied by an enqueue on a connection
          // of its own: read-committed means an uncommitted row is invisible
          // to every other backend, so a second connection seeing zero rows
          // while the first is mid-transaction is proof of where the insert
          // went. The owner client is a different pool entirely.
          const insideCount = yield* asApp(
            withTransaction(
              Effect.gen(function* () {
                yield* jobs.enqueue('invitation-delivery', { deliveryId });
                const outside = yield* readJobs();
                return outside.length;
              }),
            ),
          );
          assert.strictEqual(insideCount, 0);

          const afterCommit = yield* readJobs();
          assert.strictEqual(afterCommit.length, 1);
          assert.deepStrictEqual(afterCommit[0]?.payload, { deliveryId });
          void schema;
        }).pipe(Effect.provide(jobsLayer)),
      { timeout: 30_000 },
    );

    it.effect(
      'enqueues on the very backend the domain write ran on',
      () =>
        Effect.gen(function* () {
          const schema = yield* withDomainTable;
          const jobs = yield* Jobs;
          const deliveryId = '33333333-3333-4333-8333-333333333333';

          const { domainPid, enqueuePid, otherPid } = yield* asApp(
            withTransaction(
              Effect.gen(function* () {
                const { sql } = yield* Transaction;
                const before = yield* sql<{
                  pid: number;
                }>`SELECT pg_backend_pid() AS pid`;
                yield* sql.unsafe(
                  `INSERT INTO ${schema}.${DOMAIN_TABLE} (note) VALUES ($1)`,
                  ['pid probe'],
                );
                yield* jobs.enqueue('invitation-delivery', { deliveryId });
                const after = yield* sql<{
                  pid: number;
                }>`SELECT pg_backend_pid() AS pid`;
                // A different pool, checked out while this transaction still
                // holds its connection: if the two pids below were equal only
                // because one connection existed, this would equal them too.
                const other = yield* asOwner(
                  Effect.flatMap(
                    Database,
                    ({ sql: ownerSql }) =>
                      ownerSql<{
                        pid: number;
                      }>`SELECT pg_backend_pid() AS pid`,
                  ),
                );
                return {
                  domainPid: before[0]?.pid,
                  enqueuePid: after[0]?.pid,
                  otherPid: other[0]?.pid,
                };
              }),
            ),
          );

          assert.isNumber(domainPid);
          assert.strictEqual(domainPid, enqueuePid);
          assert.notStrictEqual(domainPid, otherPid);
        }).pipe(Effect.provide(jobsLayer)),
      { timeout: 30_000 },
    );

    it.effect(
      'does not offer an enqueue outside a transaction',
      () =>
        Effect.gen(function* () {
          const jobs = yield* Jobs;
          // The type-level half of the guarantee. `Effect.runSync` demands
          // `R = never`; `enqueue` leaves `Transaction` in `R`, and nothing
          // but `withTransaction` provides it. If this ever compiles, the
          // unused `@ts-expect-error` is itself an error, so the probe cannot
          // rot into a comment.
          const outsideTransaction = () =>
            // @ts-expect-error -- Jobs.enqueue requires Transaction
            Effect.runSync(jobs.enqueue('protocol-store-gc', {}));
          assert.isFunction(outsideTransaction);
        }).pipe(Effect.provide(jobsLayer)),
    );

    it.effect(
      'refuses a payload carrying a field the queue does not declare',
      () =>
        Effect.gen(function* () {
          yield* withDomainTable;
          const jobs = yield* Jobs;
          const refused = yield* Effect.exit(
            asApp(
              withTransaction(
                jobs.enqueue('invitation-delivery', {
                  deliveryId: '44444444-4444-4444-8444-444444444444',
                  // The excess property JOB_PAYLOAD_PARSE_OPTIONS exists for;
                  // Schema.Struct would otherwise strip it silently.
                  ...{ teamId: 'a-team' },
                }),
              ),
            ),
          );
          assert.isTrue(Exit.isFailure(refused));
          assert.deepStrictEqual(yield* readJobs(), []);
        }).pipe(Effect.provide(jobsLayer)),
      { timeout: 30_000 },
    );
  });
});
