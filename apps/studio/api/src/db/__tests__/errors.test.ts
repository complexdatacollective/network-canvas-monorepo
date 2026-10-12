import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { Deferred, Effect, Fiber, Predicate, Result } from 'effect';
import { SqlError } from 'effect/sql';
import { describe } from 'vitest';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

import {
  TestDatabase,
  TestDatabaseLive,
  testDb,
} from '../../__tests__/support/database.ts';
import {
  isLockUnavailable,
  isMissingRole,
  sqlState,
  uniqueViolationConstraint,
} from '../errors.ts';
import { MaintenanceScope, Transaction } from '../tenant.ts';

const seedRow = Effect.fnUntraced(function* () {
  const harness = yield* TestDatabase;
  const teamId = `team-${randomUUID().slice(0, 8)}`;
  const protocolId = randomUUID();
  yield* harness.onOwner(
    Effect.gen(function* () {
      yield* harness.owner.sql`insert into teams (id, name, slug)
                               values (${teamId}, ${teamId}, ${teamId})`;
      yield* harness.owner.sql`insert into protocols (id, team_id, name)
                               values (${protocolId}, ${teamId}, 'contended')`;
    }),
  );
  return { teamId, protocolId };
});

const whileLocked = <A, E, R>(use: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const harness = yield* TestDatabase;
    const locked = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    const holder = yield* Effect.forkChild(
      harness.onOwner(
        Effect.gen(function* () {
          yield* harness.owner.sql`select id from protocols for update`;
          yield* Deferred.succeed(locked, undefined);
          yield* Deferred.await(release);
        }),
      ),
    );
    yield* Deferred.await(locked);
    const outcome = yield* Effect.result(use);
    yield* Deferred.succeed(release, undefined);
    yield* Fiber.join(holder);
    return outcome;
  });

const CONTEND = 'select id from protocols for update nowait';

describe.skipIf(!testDb)('reading a database failure', () => {
  layer(TestDatabaseLive, { excludeTestServices: true })(
    'against the server that raises it',
    (it) => {
      it.effect('sees 55P03 through a bare SqlError', () =>
        Effect.gen(function* () {
          yield* seedRow();
          const outcome = yield* whileLocked(
            MaintenanceScope.open(
              Effect.flatMap(Transaction, ({ sql }) =>
                sql.unsafe<{ id: string }>(CONTEND),
              ),
            ),
          );

          assert.isTrue(Result.isFailure(outcome));
          if (Result.isFailure(outcome)) {
            assert.isTrue(SqlError.isSqlError(outcome.failure));
            assert.strictEqual(sqlState(outcome.failure), '55P03');
            assert.isTrue(isLockUnavailable(outcome.failure));
          }
        }),
      );

      it.effect('sees 55P03 through drizzle’s query error', () =>
        Effect.gen(function* () {
          yield* seedRow();
          const outcome = yield* whileLocked(
            MaintenanceScope.open(
              Effect.flatMap(Transaction, ({ tx }) =>
                tx.execute(drizzleSql.raw(CONTEND)),
              ),
            ),
          );

          assert.isTrue(Result.isFailure(outcome));
          if (Result.isFailure(outcome)) {
            const failure: unknown = outcome.failure;
            assert.isFalse(SqlError.isSqlError(failure));
            assert.isTrue(Predicate.isObject(failure));
            if (Predicate.isObject(failure) && '_tag' in failure) {
              assert.strictEqual(failure._tag, 'EffectDrizzleQueryError');
            }
            assert.strictEqual(sqlState(failure), '55P03');
            assert.isTrue(isLockUnavailable(failure));
          }
        }),
      );

      it.effect('does not read a lock refusal into a statement that ran', () =>
        Effect.gen(function* () {
          yield* seedRow();
          const rows = yield* MaintenanceScope.open(
            Effect.flatMap(Transaction, ({ sql }) =>
              sql.unsafe<{ id: string }>(CONTEND),
            ),
          );
          assert.isTrue(rows.length > 0);
        }),
      );

      it.effect('names the constraint a unique violation broke', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const teamId = `team-${randomUUID().slice(0, 8)}`;
          const insert = harness.owner.sql`insert into teams (id, name, slug)
                                           values (${teamId}, ${teamId}, ${teamId})`;

          const outcome = yield* Effect.result(
            harness.onOwner(Effect.flatMap(insert, () => insert)),
          );

          assert.isTrue(Result.isFailure(outcome));
          if (Result.isFailure(outcome)) {
            assert.strictEqual(sqlState(outcome.failure), '23505');
            assert.strictEqual(
              uniqueViolationConstraint(outcome.failure),
              'teams_pkey',
            );
          }
        }),
      );

      it.effect('names no constraint for a failure that is not one', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const outcome = yield* Effect.result(
            harness.onOwner(
              harness.owner.sql`insert into teams (id, name, slug)
                                values (${randomUUID()}, null, ${randomUUID()})`,
            ),
          );

          assert.isTrue(Result.isFailure(outcome));
          if (Result.isFailure(outcome)) {
            assert.strictEqual(sqlState(outcome.failure), '23502');
            assert.isUndefined(uniqueViolationConstraint(outcome.failure));
          }
        }),
      );

      it.effect('recognises the 22023 a missing role raises', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;
          const suffix = randomUUID().replaceAll('-', '').slice(0, 8);

          const tenant = yield* Effect.result(
            harness.onOwner(
              harness.owner.sql.unsafe(
                `set local role ${TENANT_ROLES.maintenance}_absent_${suffix}`,
              ),
            ),
          );
          assert.isTrue(Result.isFailure(tenant));
          if (Result.isFailure(tenant)) {
            assert.strictEqual(sqlState(tenant.failure), '22023');
            assert.isTrue(isMissingRole(tenant.failure));
          }

          const unrelated = yield* Effect.result(
            harness.onOwner(
              harness.owner.sql.unsafe(`set local role absent_${suffix}`),
            ),
          );
          assert.isTrue(Result.isFailure(unrelated));
          if (Result.isFailure(unrelated)) {
            assert.strictEqual(sqlState(unrelated.failure), '22023');
            assert.isFalse(isMissingRole(unrelated.failure));
          }
        }),
      );

      it.effect('reads no SQLSTATE off an unrelated failure', () =>
        Effect.gen(function* () {
          const harness = yield* TestDatabase;

          const outcome = yield* Effect.result(
            harness.onOwner(Effect.fail(new Error('the caller gave up'))),
          );
          assert.isTrue(Result.isFailure(outcome));
          if (Result.isFailure(outcome)) {
            assert.isUndefined(sqlState(outcome.failure));
            assert.isFalse(isLockUnavailable(outcome.failure));
            assert.isFalse(isMissingRole(outcome.failure));
            assert.isUndefined(uniqueViolationConstraint(outcome.failure));
          }

          const fromServer = yield* Effect.result(
            harness.onOwner(
              harness.owner.sql`select no_such_column from teams`,
            ),
          );
          assert.isTrue(Result.isFailure(fromServer));
          if (Result.isFailure(fromServer)) {
            assert.strictEqual(sqlState(fromServer.failure), '42703');
          }
        }),
      );
    },
  );
});
