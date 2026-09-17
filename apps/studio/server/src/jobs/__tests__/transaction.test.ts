import { assert, describe, it, layer } from '@effect/vitest';
import { Effect, Exit } from 'effect';

import { reachableDb } from '../../__tests__/support/postgres.ts';
import { MaintenanceDatabase } from '../../db/client.ts';
import { MaintenanceScope, Transaction } from '../../db/tenant.ts';
import { Jobs, RecordedJobs } from '../jobs.ts';
import {
  asApp,
  asOwner,
  layerJobs,
  layerQueueHarness,
  QueueHarness,
  readJobs,
} from './support.ts';

// The transaction guarantee, which is the queue's reason to exist: a domain
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

/**
 * The recording layer never issues a statement, so the `Transaction` it is
 * handed carries a statement client and a builder handle that nothing calls.
 * Reaching for either throws, which is the honest shape: a recorded enqueue
 * that ran SQL would not be recording.
 */
const refuse = () => {
  throw new Error('the recording enqueue must not issue a statement');
};

const NO_SQL: Transaction['Service']['sql'] = new Proxy(
  (() => undefined) as unknown as Transaction['Service']['sql'],
  { get: refuse, apply: refuse },
);

const NO_TX: Transaction['Service']['tx'] = new Proxy(
  {} as Transaction['Service']['tx'],
  { get: refuse },
);

/**
 * A payload with a field the queue forbids, built without a cast. TypeScript's
 * excess-property check only fires on a fresh object literal, so a value that
 * reached the call through a variable carries the extra field happily — which
 * is exactly the shape a row written by an older release would have, and the
 * reason `onExcessProperty: 'error'` exists at all.
 */
const withExcessField = Object.assign(
  { deliveryId: '44444444-4444-4444-8444-444444444444' },
  { teamId: 'a-team' },
);

describe.skipIf(!db)('the transaction guarantee', () => {
  layer(layerQueueHarness(db!))('with the queue installed', (suite) => {
    const DOMAIN_TABLE = 'jobs_domain';

    const withDomainTable = Effect.gen(function* () {
      const { schema } = yield* QueueHarness;
      yield* asOwner(
        Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
          sql.unsafe(
            `CREATE TABLE IF NOT EXISTS ${schema}.${DOMAIN_TABLE} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), note text NOT NULL)`,
          ),
        ),
      );
      yield* asOwner(
        Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
          sql.unsafe(
            `GRANT INSERT, SELECT, DELETE ON ${schema}.${DOMAIN_TABLE} TO studio_app`,
          ),
        ),
      );
      yield* asOwner(
        Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
          sql.unsafe(`DELETE FROM ${schema}.${DOMAIN_TABLE}`),
        ),
      );
      yield* asOwner(
        Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
          sql.unsafe(`DELETE FROM ${schema}.jobs`),
        ),
      );
      return schema;
    });

    const countDomainRows = Effect.fnUntraced(function* () {
      const { schema } = yield* QueueHarness;
      const rows = yield* asOwner(
        Effect.flatMap(
          MaintenanceDatabase,
          ({ sql }) =>
            sql<{
              count: number;
            }>`SELECT count(*)::int AS count FROM ${sql(schema)}.${sql(DOMAIN_TABLE)}`,
        ),
      );
      return rows[0]?.count ?? 0;
    });

    const jobsLayer = layerJobs;

    suite.effect(
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
              MaintenanceScope.open(
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
          const jobId = yield* asApp(MaintenanceScope.open(write('committed')));
          assert.strictEqual(yield* countDomainRows(), 1);
          const queued = yield* readJobs();
          assert.strictEqual(queued.length, 1);
          assert.strictEqual(queued[0]?.id, jobId);
          assert.strictEqual(queued[0]?.state, 'created');
          assert.deepStrictEqual(queued[0]?.payload, { deliveryId });
        }).pipe(Effect.provide(jobsLayer)),
      { timeout: 30_000 },
    );

    suite.effect(
      'hides the job from every other connection until the commit',
      () =>
        Effect.gen(function* () {
          // The domain table is set up for the symmetry with the case above
          // rather than written to: what this case is about is where the job
          // insert went, and a domain row would only be a second thing to
          // clear between cases.
          yield* withDomainTable;
          const jobs = yield* Jobs;
          const deliveryId = '22222222-2222-4222-8222-222222222222';

          // The oracle that cannot be satisfied by an enqueue on a connection
          // of its own: read-committed means an uncommitted row is invisible
          // to every other backend, so a second connection seeing zero rows
          // while the first is mid-transaction is proof of where the insert
          // went. The owner client is a different pool entirely.
          const insideCount = yield* asApp(
            MaintenanceScope.open(
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
        }).pipe(Effect.provide(jobsLayer)),
      { timeout: 30_000 },
    );

    suite.effect(
      'enqueues on the very backend the domain write ran on',
      () =>
        Effect.gen(function* () {
          const schema = yield* withDomainTable;
          const jobs = yield* Jobs;
          const deliveryId = '33333333-3333-4333-8333-333333333333';

          const { domainPid, enqueuePid, otherPid } = yield* asApp(
            MaintenanceScope.open(
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
                    MaintenanceDatabase,
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

    suite.effect('does not offer an enqueue outside a transaction', () =>
      Effect.gen(function* () {
        const jobs = yield* Jobs;
        // The type-level half of the guarantee. `Effect.runSync` demands
        // `R = never`; `enqueue` leaves `Transaction` in `R`, and nothing but
        // a scope (src/db/tenant.ts) provides it. If this ever compiles, the
        // unused `@ts-expect-error` is itself an error, so the probe cannot
        // rot into a comment.
        const outsideTransaction = () =>
          // @ts-expect-error -- Jobs.enqueue requires Transaction
          Effect.runSync(jobs.enqueue('protocol-store-gc', {}));
        assert.isFunction(outsideTransaction);
      }).pipe(Effect.provide(jobsLayer)),
    );

    suite.effect(
      'refuses a payload carrying a field the queue does not declare',
      () =>
        Effect.gen(function* () {
          yield* withDomainTable;
          const jobs = yield* Jobs;
          const refused = yield* Effect.exit(
            asApp(
              MaintenanceScope.open(
                // `Schema.Struct` would strip `teamId` silently without
                // `onExcessProperty: 'error'`, and the job would reach the
                // table with a field the payload policy forbids.
                jobs.enqueue('invitation-delivery', withExcessField),
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

// The recording layer is the alternative `Jobs` implementation the domain
// suites use (#1927 §4). It needs no database, so it needs no harness — but it
// must keep the same two promises the live one makes, or a command tested
// under it would be tested against a weaker contract than it ships with.
describe('the recording enqueue', () => {
  it.effect('records what the live layer would have inserted', () =>
    Effect.gen(function* () {
      const jobs = yield* Jobs;
      const store = yield* RecordedJobs;
      const deliveryId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

      const id = yield* Effect.provideService(
        jobs.enqueue('invitation-delivery', { deliveryId }),
        Transaction,
        Transaction.of({ tx: NO_TX, sql: NO_SQL, teamId: 'a-team' }),
      );

      assert.deepStrictEqual(store.recorded, [
        {
          id,
          queue: 'invitation-delivery',
          payload: { deliveryId },
          startAfter: undefined,
          singletonKey: undefined,
        },
      ]);
      yield* store.clear;
      assert.deepStrictEqual(store.recorded, []);
    }).pipe(Effect.provide(Jobs.layerRecording)),
  );

  it.effect('validates the payload the live layer validates', () =>
    Effect.gen(function* () {
      const jobs = yield* Jobs;
      const store = yield* RecordedJobs;
      const refused = yield* Effect.exit(
        Effect.provideService(
          jobs.enqueue('invitation-delivery', withExcessField),
          Transaction,
          Transaction.of({ tx: NO_TX, sql: NO_SQL, teamId: null }),
        ),
      );
      // A defect, as under the live layer: a command that built its own
      // payload wrongly has nothing useful to do about it.
      assert.isTrue(Exit.isFailure(refused));
      assert.deepStrictEqual(store.recorded, []);
    }).pipe(Effect.provide(Jobs.layerRecording)),
  );

  it.effect('still refuses to run outside a transaction', () =>
    Effect.gen(function* () {
      const jobs = yield* Jobs;
      const outsideTransaction = () =>
        // @ts-expect-error -- the recording enqueue requires Transaction too
        Effect.runSync(jobs.enqueue('protocol-store-gc', {}));
      assert.isFunction(outsideTransaction);
    }).pipe(Effect.provide(Jobs.layerRecording)),
  );
});
