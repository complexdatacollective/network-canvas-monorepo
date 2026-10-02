import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { Cause, Effect, Exit, Option, Result } from 'effect';
import type { SqlClient } from 'effect/sql';
import { describe, test } from 'vitest';

import { TEAM_GUC } from '@codaco/studio-sync/rls';

import {
  TestDatabase,
  type TestDatabaseShape,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import { Database } from '../client.ts';
import { isLockUnavailable } from '../errors.ts';
import {
  MaintenanceScope,
  OwnerScope,
  TenantScope,
  Transaction,
  UntenantedScope,
  unsafeMakeTeamAccess,
} from '../tenant.ts';

const TEAM_A = unsafeMakeTeamAccess('team-a', 'owner');
const TEAM_B = unsafeMakeTeamAccess('team-b', 'owner');

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

const onSecondClient = <A, E, R>(
  harness: TestDatabaseShape,
  body: Effect.Effect<A, E, R>,
) => Effect.provideService(body, Database, harness.secondApp);

const diesWith = <A, E, R>(effect: Effect.Effect<A, E, R>, text: string) =>
  Effect.map(
    Effect.exit(effect),
    (exit) =>
      Exit.hasDies(exit) &&
      Exit.isFailure(exit) &&
      String(Cause.squash(exit.cause)).includes(text),
  );

const OTHER_TEAM = 'cannot be nested in one for team';

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

          assert.deepStrictEqual(asA, [TEAM_A.teamId]);
          assert.deepStrictEqual(asB, [TEAM_B.teamId]);
        }),
      );

      it.effect('is refused a write for another team by WITH CHECK', () =>
        Effect.gen(function* () {
          yield* seedTeams();
          const mine = randomUUID();
          const theirs = randomUUID();

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
          const after = yield* harness.app.sql.withTransaction(
            read(harness.app.sql),
          );

          assert.strictEqual(stamped?.team, TEAM_A.teamId);
          assert.strictEqual(after?.backend, stamped?.backend);
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

          assert.isTrue(Exit.hasDies(exit));
          if (Exit.isFailure(exit)) {
            assert.isTrue(
              String(Cause.squash(exit.cause)).includes(
                'only be set at the root of a transaction',
              ),
            );
          }

          yield* TenantScope.open(
            TEAM_A,
            TenantScope.open(TEAM_A, Effect.void),
          );
          yield* TenantScope.open(TEAM_A, Effect.void, {
            isolation: 'repeatable read',
          });
        }),
      );

      it.effect('dies when a nested scope names another team', () =>
        Effect.gen(function* () {
          assert.isTrue(
            yield* diesWith(
              TenantScope.open(TEAM_A, TenantScope.open(TEAM_B, Effect.void)),
              OTHER_TEAM,
            ),
          );
          assert.isTrue(
            yield* diesWith(
              MaintenanceScope.openTenant(
                TEAM_A,
                MaintenanceScope.openTenant(TEAM_B, Effect.void),
              ),
              OTHER_TEAM,
            ),
          );

          yield* TenantScope.open(
            TEAM_A,
            TenantScope.open(TEAM_A, Effect.void),
          );
          yield* TenantScope.open(
            TEAM_A,
            Effect.flatMap(TestDatabase, (harness) =>
              onSecondClient(harness, TenantScope.open(TEAM_B, Effect.void)),
            ),
          );
        }),
      );

      it.effect('dies when an untenanted scope and a tenant one nest', () =>
        Effect.gen(function* () {
          assert.isTrue(
            yield* diesWith(
              TenantScope.open(TEAM_A, UntenantedScope.open(Effect.void)),
              OTHER_TEAM,
            ),
          );
          assert.isTrue(
            yield* diesWith(
              UntenantedScope.open(TenantScope.open(TEAM_A, Effect.void)),
              OTHER_TEAM,
            ),
          );
          yield* UntenantedScope.open(UntenantedScope.open(Effect.void));
        }),
      );

      it.effect(
        'dies when the transaction it would nest in is not its own',
        () =>
          Effect.gen(function* () {
            assert.isTrue(
              yield* diesWith(
                TenantScope.open(
                  TEAM_A,
                  OwnerScope.open(UntenantedScope.open(Effect.void)),
                ),
                'nested in the scope that opened it',
              ),
            );
            yield* TenantScope.open(TEAM_A, OwnerScope.open(Effect.void));
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

              const outerRows = yield* sql<{
                id: string;
              }>`select id from protocols where id = ${outerId}`;
              const nestedRows = yield* sql<{
                id: string;
              }>`select id from protocols where id = ${nestedId}`;
              assert.strictEqual(outerRows.length, 1);
              assert.strictEqual(nestedRows.length, 0);

              return yield* contendFor(harness, lockedId);
            }),
          );

          assert.isTrue(Result.isFailure(contended));
          if (Result.isFailure(contended)) {
            assert.isTrue(isLockUnavailable(contended.failure));
          }

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

describe('the tenant scope’s key', () => {
  test('is a TeamAccess, never a bare team id or a look-alike', () => {
    // An unused `@ts-expect-error` is itself an error, so this fails the build.
    // @ts-expect-error -- a tenant transaction takes a TeamAccess, never a team id
    const bare = TenantScope.open('team-a', Effect.void);
    // Passed by name, not as a literal: a fresh literal would trip the
    // excess-property check on `role` without the brand being what refused it.
    const lookAlike = { teamId: 'team-a', role: 'owner' as const };
    // @ts-expect-error -- the brand is a non-exported unique symbol, so no look-alike carries it
    const forged = TenantScope.open(lookAlike, Effect.void);
    assert.isTrue(Effect.isEffect(bare) && Effect.isEffect(forged));
  });
});
