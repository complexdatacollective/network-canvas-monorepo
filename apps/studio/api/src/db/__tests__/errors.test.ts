import { randomUUID } from 'node:crypto';

import { assert, layer } from '@effect/vitest';
import { sql as drizzleSql } from 'drizzle-orm';
import { Deferred, Effect, Fiber, Predicate, Result } from 'effect';
import { SqlError } from 'effect/unstable/sql';
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

// One reading of a database failure, against a real server (#1927 section 9).
//
// The same condition reaches a caller in two shapes and the predicates have to
// see through both: a bare `SqlError` from a statement run on the `SqlClient`,
// and drizzle's `EffectDrizzleQueryError`, which catches the failure and
// re-raises it with the query text attached and the original in an Effect
// `Cause` under `cause`. Neither shape can be constructed by hand and trusted
// — the wrapper's field is `Schema.Unknown`, so nothing but the running
// library says what is actually in it — which is why every case here provokes
// the real Postgres error.

/** A team and one protocol row in it, so there is something to contend over. */
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

/**
 * Runs `use` while a second connection holds a row lock on every protocol row,
 * and answers what `use` did. The holder is the owner client, so the lock is
 * held by a different connection from the one `use` runs on — a transaction on
 * the same client and fiber would join the holder's rather than contend with
 * it, and `FOR UPDATE NOWAIT` would then succeed.
 */
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
            // The shape, so the two halves of this pair cannot both be the
            // same one: this is the statement client's own error.
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
            // Not a `SqlError`: drizzle replaced it, and the SQLSTATE is only
            // reachable through the `Cause` it stored under `cause`.
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
          // The same statement with nothing holding the lock: it succeeds, so
          // the pair above is measuring the contention and not the `NOWAIT`.
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
          // A not-null violation: a constraint failure with a SQLSTATE of its
          // own, so this proves the predicate reads 23505 rather than merely
          // finding a `constraint` property somewhere down the chain.
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

          // The same SQLSTATE from a role that is nothing to do with Studio:
          // an unapplied database is what the predicate is for, and a
          // deployment's own missing role is not that.
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

          // A failure raised in Effect rather than by the server, of the kind
          // a command body can fail with inside a scope.
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

          // The control: a failure the server did raise, on the same path,
          // does carry one — so `undefined` above is the absence of a
          // SQLSTATE and not this path losing them all.
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
