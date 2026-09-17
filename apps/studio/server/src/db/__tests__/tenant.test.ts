import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Option, Result } from 'effect';
import type { SqlClient } from 'effect/unstable/sql';
import { describe } from 'vitest';

import { TEAM_GUC } from '@codaco/studio-sync/rls';

import {
  TestDatabase,
  type TestDatabaseShape,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { Database } from '../client.ts';
import { isLockUnavailable } from '../errors.ts';
import { TenantScope, Transaction, unsafeMakeTeamAccess } from '../tenant.ts';

// The tenant scope: the only way Studio opens a transaction on the application
// client, and where the team boundary is stamped (#1927 sections 9, 10 and 21).
//
// All of it is measured against a real server because none of it is visible
// from the process. Row-level security is the database declining to return a
// row; the team GUC is a transaction-local setting the server forgets on
// commit; and "the outer transaction is still open" can only be answered by
// another connection finding its rows locked.

const TEAM_A = unsafeMakeTeamAccess('team-a', 'owner');
const TEAM_B = unsafeMakeTeamAccess('team-b', 'owner');

/** One protocol row per team, and the teams they belong to. */
const seedTeams = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  const rows = [TEAM_A, TEAM_B].map((access) => ({
    teamId: access.teamId,
    protocolId: randomUUID(),
  }));
  yield* harness.onOwner(
    Effect.gen(function* () {
      for (const { teamId, protocolId } of rows) {
        yield* harness.owner.sql`insert into teams (id, name, slug)
                                 values (${teamId}, ${teamId}, ${teamId})
                                 on conflict (id) do nothing`;
        yield* harness.owner.sql`insert into protocols (id, team_id, name)
                                 values (${protocolId}, ${teamId}, ${teamId})`;
      }
    }),
  );
  return rows;
});

/**
 * Which teams own the rows this scope can see. Distinct rather than a row
 * list, so a case that leaves rows behind cannot change what a later case
 * reads.
 */
const visibleTeams = Effect.flatMap(Transaction, ({ sql }) =>
  Effect.map(
    sql<{
      team_id: string;
    }>`select distinct team_id from protocols order by team_id`,
    (rows) => rows.map((row) => row.team_id),
  ),
);

const countProtocols = Effect.flatMap(Transaction, ({ sql }) =>
  Effect.map(
    sql<{ count: number }>`select count(*)::int as count from protocols`,
    (rows) => rows[0]?.count ?? -1,
  ),
);

const insertProtocolFor = (teamId: string, id: string) =>
  Effect.flatMap(
    Transaction,
    ({ sql }) => sql`insert into protocols (id, team_id, name)
                     values (${id}, ${teamId}, 'written')`,
  );

/** Committed rows, read as the owner: the suite's oracle sees every team. */
const committedRows = (id: string) =>
  Effect.flatMap(TestDatabase, (harness) =>
    harness.onOwner(
      Effect.map(
        harness.owner.sql<{ id: string }>`select id from protocols
                                          where id = ${id}`,
        (rows) => rows.length,
      ),
    ),
  );

/**
 * The same scope on the second application client: its own connection, its own
 * transaction, committed by the time the effect returns. Nothing shorter will
 * do — a statement issued on that client without a scope carries neither the
 * pinned role nor the scratch schema's search path.
 */
const onSecondClient = <A, E, R>(
  harness: TestDatabaseShape,
  body: Effect.Effect<A, E, R>,
) => Effect.provideService(body, Database, harness.secondApp);

/** A `FOR UPDATE NOWAIT` from a connection that is in no transaction of ours. */
const contendFor = (harness: TestDatabaseShape, id: string) =>
  Effect.result(
    harness.onOwner(
      harness.owner.sql<{ id: string }>`select id from protocols
                                        where id = ${id} for update nowait`,
    ),
  );

describe.skipIf(!testDb)('the tenant scope', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'on a scratch schema under row-level security',
    (it) => {
      it.effect('sees only the team it was opened for', () =>
        Effect.gen(function* () {
          yield* seedTeams();

          const asA = yield* TenantScope.open(TEAM_A, visibleTeams);
          const asB = yield* TenantScope.open(TEAM_B, visibleTeams);

          // Both halves: a scope that saw nothing at all would satisfy the
          // first assertion on its own, and the second says the rows the
          // first could not see are really there.
          assert.deepStrictEqual(asA, [TEAM_A.teamId]);
          assert.deepStrictEqual(asB, [TEAM_B.teamId]);
        }),
      );

      it.effect('is refused a write for another team by WITH CHECK', () =>
        Effect.gen(function* () {
          yield* seedTeams();
          const mine = randomUUID();
          const theirs = randomUUID();

          // The control first: the same statement for the scope's own team is
          // accepted, so the refusal below is the team and not the insert.
          yield* TenantScope.open(
            TEAM_A,
            insertProtocolFor(TEAM_A.teamId, mine),
          );
          assert.strictEqual(yield* committedRows(mine), 1);

          const refused = yield* Effect.result(
            TenantScope.open(TEAM_A, insertProtocolFor(TEAM_B.teamId, theirs)),
          );
          assert.isTrue(Result.isFailure(refused));
          assert.strictEqual(yield* committedRows(theirs), 0);
        }),
      );

      it.effect('leaves no team behind on the pooled connection', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const read = (sql: SqlClient.SqlClient) =>
            Effect.map(
              sql<{
                team: string;
                backend: number;
              }>`select coalesce(current_setting(${TEAM_GUC}, true), 'unset') as team,
                        pg_backend_pid() as backend`,
              (rows) => rows[0],
            );

          const stamped = yield* TenantScope.open(
            TEAM_A,
            Effect.flatMap(Transaction, ({ sql }) => read(sql)),
          );
          // The next transaction on the same client, opened without the scope
          // so that nothing stamps a team.
          const after = yield* harness.app.sql.withTransaction(
            read(harness.app.sql),
          );

          assert.strictEqual(stamped?.team, TEAM_A.teamId);
          // The application client holds one connection, so this is the very
          // backend that was stamped. Without that the emptiness below would
          // say nothing at all.
          assert.strictEqual(after?.backend, stamped?.backend);
          // `set_config(..., true)` is transaction-local. Once it has expired
          // `current_setting(name, true)` reads '' rather than NULL for the
          // rest of the session — '' being the value every policy fails
          // closed on — so 'unset' here would mean a different backend.
          assert.strictEqual(after?.team, '');
        }),
      );

      it.effect('takes the isolation level it was given', () =>
        Effect.gen(function* () {
          const isolation = Effect.flatMap(Transaction, ({ sql }) =>
            Effect.map(
              sql<{
                level: string;
              }>`select current_setting('transaction_isolation') as level`,
              (rows) => rows[0]?.level,
            ),
          );

          assert.strictEqual(
            yield* TenantScope.open(TEAM_A, isolation, {
              isolation: 'repeatable read',
            }),
            'repeatable read',
          );
          // The server's standing default, so the reading above is the
          // request and not the configuration.
          assert.strictEqual(
            yield* TenantScope.open(TEAM_A, isolation),
            'read committed',
          );
        }),
      );

      it.effect('holds one snapshot across a repeatable read scope', () =>
        Effect.gen(function* () {
          yield* seedTeams();
          const harness = yield* TestDatabase;

          /**
           * Counts the rows, lets a committed insert by another connection
           * land in between, and counts them again.
           */
          const readAcross = (isolation?: 'repeatable read') =>
            TenantScope.open(
              TEAM_A,
              Effect.gen(function* () {
                const before = yield* countProtocols;
                yield* onSecondClient(
                  harness,
                  TenantScope.open(
                    TEAM_A,
                    insertProtocolFor(TEAM_A.teamId, randomUUID()),
                  ),
                );
                const after = yield* countProtocols;
                return { before, after };
              }),
              isolation === undefined ? undefined : { isolation },
            );

          const frozen = yield* readAcross('repeatable read');
          assert.strictEqual(frozen.after, frozen.before);

          // The same sequence at the default isolation does see the write, so
          // the equality above is the snapshot and not an insert that never
          // committed — or one that landed somewhere this scope cannot read.
          const live = yield* readAcross();
          assert.strictEqual(live.after, live.before + 1);
        }),
      );

      it.effect('dies when a nested scope asks for an isolation level', () =>
        Effect.gen(function* () {
          const exit = yield* Effect.exit(
            TenantScope.open(
              TEAM_A,
              TenantScope.open(TEAM_A, Effect.void, {
                isolation: 'repeatable read',
              }),
            ),
          );

          // A defect, not a failure: `set transaction` inside a transaction
          // that has begun is a programming error, not something a caller can
          // recover from (#1927 section 21 F6).
          assert.isTrue(Exit.hasDies(exit));
          if (Exit.isFailure(exit)) {
            assert.isTrue(
              String(Cause.squash(exit.cause)).includes(
                'only be set at the root of a transaction',
              ),
            );
          }

          // Both controls, so the death is the nesting and not the option:
          // the same nesting without one, and the same option at the root.
          yield* TenantScope.open(
            TEAM_A,
            TenantScope.open(TEAM_A, Effect.void),
          );
          yield* TenantScope.open(TEAM_A, Effect.void, {
            isolation: 'repeatable read',
          });
        }),
      );

      it.effect('rolls back a nested scope without ending the outer one', () =>
        Effect.gen(function* () {
          const [teamA] = yield* seedTeams();
          const harness = yield* TestDatabase;
          const lockedId = teamA?.protocolId ?? '';
          const outerId = randomUUID();
          const nestedId = randomUUID();

          const contended = yield* TenantScope.open(
            TEAM_A,
            Effect.gen(function* () {
              const { sql } = yield* Transaction;
              yield* sql`select id from protocols
                         where id = ${lockedId} for update`;
              yield* insertProtocolFor(TEAM_A.teamId, outerId);

              const nested = yield* Effect.result(
                TenantScope.open(
                  TEAM_A,
                  Effect.gen(function* () {
                    yield* insertProtocolFor(TEAM_A.teamId, nestedId);
                    return yield* Effect.fail(
                      new Error('the nested command gave up'),
                    );
                  }),
                ),
              );
              assert.isTrue(Result.isFailure(nested));

              // The savepoint took the nested write with it, and left the
              // outer one — read inside the still-open transaction, which is
              // the only place both are visible at once.
              const outerRows = yield* sql<{
                id: string;
              }>`select id from protocols where id = ${outerId}`;
              const nestedRows = yield* sql<{
                id: string;
              }>`select id from protocols where id = ${nestedId}`;
              assert.strictEqual(outerRows.length, 1);
              assert.strictEqual(nestedRows.length, 0);

              // And the transaction is still holding the lock it took before
              // the nested scope ran, which is what "only its own writes"
              // means: a rollback of the whole transaction would have
              // released it.
              return yield* contendFor(harness, lockedId);
            }),
          );

          assert.isTrue(Result.isFailure(contended));
          if (Result.isFailure(contended)) {
            assert.isTrue(isLockUnavailable(contended.failure));
          }

          // Once the outer scope has committed, the same statement from the
          // same connection succeeds — so the refusal above was the lock.
          const free = yield* contendFor(harness, lockedId);
          assert.isTrue(Result.isSuccess(free));
          assert.strictEqual(yield* committedRows(outerId), 1);
          assert.strictEqual(yield* committedRows(nestedId), 0);
        }),
      );

      it.effect('provides Transaction only inside a scope', () =>
        Effect.gen(function* () {
          assert.isTrue(
            Option.isNone(yield* Effect.serviceOption(Transaction)),
          );
          assert.isTrue(
            Option.isSome(
              yield* TenantScope.open(
                TEAM_A,
                Effect.serviceOption(Transaction),
              ),
            ),
          );
        }),
      );

      it.effect('opens on one client, and only that client', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const escaped = randomUUID();
          const rolledBack = randomUUID();

          const seen = yield* Effect.result(
            TenantScope.open(
              TEAM_A,
              Effect.gen(function* () {
                yield* insertProtocolFor(TEAM_A.teamId, rolledBack);

                // The consequence the invariant is about: work done through
                // the second client is in a transaction of its own, so it
                // commits and survives this one being rolled back.
                yield* onSecondClient(
                  harness,
                  TenantScope.open(
                    TEAM_A,
                    insertProtocolFor(TEAM_A.teamId, escaped),
                  ),
                );

                return yield* Effect.fail(new Error('the command gave up'));
              }),
            ),
          );
          assert.isTrue(Result.isFailure(seen));

          // And the reading the consequence follows from: `SqlClient` routes
          // every statement by the fiber's `TransactionConnection`, and that
          // service is keyed per client instance — so inside an open scope
          // the client that opened it has one and a second client built for
          // the same database does not.
          const inside = yield* TenantScope.open(
            TEAM_A,
            Effect.all({
              mine: Effect.serviceOption(harness.app.sql.transactionService),
              other: Effect.serviceOption(
                harness.secondApp.sql.transactionService,
              ),
            }),
          );
          assert.isTrue(Option.isSome(inside.mine));
          assert.isTrue(Option.isNone(inside.other));

          assert.strictEqual(yield* committedRows(rolledBack), 0);
          assert.strictEqual(yield* committedRows(escaped), 1);
        }),
      );
    },
  );
});
