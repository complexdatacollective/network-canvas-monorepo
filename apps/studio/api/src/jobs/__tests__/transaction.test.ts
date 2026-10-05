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

const db = await reachableDb();

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
          yield* withDomainTable;
          const jobs = yield* Jobs;
          const deliveryId = '22222222-2222-4222-8222-222222222222';

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

          const probe = [
            `CREATE TABLE ${schema}.jobs_pid_probe (pid int NOT NULL)`,
            `CREATE FUNCTION ${schema}.record_job_pid() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN INSERT INTO ${schema}.jobs_pid_probe (pid) VALUES (pg_backend_pid()); RETURN NEW; END $$`,
            `CREATE TRIGGER record_job_pid AFTER INSERT ON ${schema}.jobs FOR EACH ROW EXECUTE FUNCTION ${schema}.record_job_pid()`,
          ];
          const unprobe = [
            `DROP TRIGGER IF EXISTS record_job_pid ON ${schema}.jobs`,
            `DROP FUNCTION IF EXISTS ${schema}.record_job_pid()`,
            `DROP TABLE IF EXISTS ${schema}.jobs_pid_probe`,
          ];
          const runAsOwner = (statements: ReadonlyArray<string>) =>
            asOwner(
              Effect.flatMap(MaintenanceDatabase, ({ sql }) =>
                Effect.forEach(statements, (statement) =>
                  sql.unsafe(statement),
                ),
              ),
            );

          yield* runAsOwner(unprobe);
          yield* runAsOwner(probe);

          const measure = Effect.gen(function* () {
            const { domainPid, otherPid } = yield* asApp(
              MaintenanceScope.open(
                Effect.gen(function* () {
                  const { sql } = yield* Transaction;
                  const domain = yield* sql.unsafe<{ pid: number }>(
                    `INSERT INTO ${schema}.${DOMAIN_TABLE} (note) VALUES ($1) RETURNING pg_backend_pid() AS pid`,
                    ['pid probe'],
                  );
                  yield* jobs.enqueue('invitation-delivery', { deliveryId });
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
                    domainPid: domain[0]?.pid,
                    otherPid: other[0]?.pid,
                  };
                }),
              ),
            );
            const enqueuePids = yield* asOwner(
              Effect.flatMap(
                MaintenanceDatabase,
                ({ sql }) =>
                  sql<{
                    pid: number;
                  }>`SELECT pid FROM ${sql(schema)}.jobs_pid_probe`,
              ),
            );
            return {
              domainPid,
              otherPid,
              enqueuePids: enqueuePids.map((row) => row.pid),
            };
          });

          const { domainPid, otherPid, enqueuePids } = yield* measure.pipe(
            Effect.ensuring(Effect.orDie(runAsOwner(unprobe))),
          );

          assert.isNumber(domainPid);
          assert.deepStrictEqual(enqueuePids, [domainPid]);
          assert.notStrictEqual(domainPid, otherPid);
        }).pipe(Effect.provide(jobsLayer)),
      { timeout: 30_000 },
    );

    suite.effect('does not offer an enqueue outside a transaction', () =>
      Effect.gen(function* () {
        const jobs = yield* Jobs;
        // An unused `@ts-expect-error` is itself an error, so the probe cannot rot.
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
