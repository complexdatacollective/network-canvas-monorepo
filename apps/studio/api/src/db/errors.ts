import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core';
import { Cause, Effect, Predicate } from 'effect';
import { SqlError } from 'effect/unstable/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

// One reading of a database failure for the whole data layer (#1927 §9).
//
// The same Postgres condition now arrives in three shapes, and a caller that
// branches on one of them misses the other two:
//
//   * a bare `SqlError`, whose `reason.cause` is the driver's own error;
//   * a drizzle `EffectDrizzleQueryError`, whose `cause` is an Effect `Cause`
//     wrapping one of those — the builder catches the failure and re-raises it
//     with the query text attached;
//   * the driver error itself, which the node-postgres scripts still see.
//
// `sqlState` walks all three to the SQLSTATE, so every predicate below is
// written once against a five-character string.

const LOCK_NOT_AVAILABLE = '55P03';
const UNIQUE_VIOLATION = '23505';
const INVALID_PARAMETER_VALUE = '22023';

/**
 * The SQLSTATE a failure carries, or `undefined` when it is not a database
 * failure at all.
 *
 * Read through the chain rather than off the top: a missing `code` would
 * otherwise read the same as a privilege error that never happened.
 */
export function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  // Bounded: a cause chain is short, and a cycle would otherwise hang the
  // process rather than fail a request.
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) return undefined;
    // drizzle stores an Effect `Cause` here; squashing it yields the failure
    // (or defect) the cause carries, which is the `SqlError` underneath.
    if (Cause.isCause(current)) {
      current = Cause.squash(current);
      continue;
    }
    if ('code' in current && Predicate.isString(current.code)) {
      return current.code;
    }
    if (!('cause' in current)) return undefined;
    current = current.cause;
  }
  return undefined;
}

/**
 * True when the statement asked not to wait for a lock and would have had to.
 *
 * `55P03` is checked first and the driver-independent tag second: the SQLSTATE
 * is what Postgres actually said, and the tag is the driver's classification of
 * it (`@effect/sql-pg`'s `internal/sqlError.ts` maps the state to
 * `LockTimeoutError`).
 * Reading only the tag would miss a refusal that reached us as a raw driver
 * error; reading only the state would miss one the driver classified without
 * preserving it.
 */
export function isLockUnavailable(error: unknown): boolean {
  if (sqlState(error) === LOCK_NOT_AVAILABLE) return true;
  return reasonTag(error) === 'LockTimeoutError';
}

/** The constraint a unique violation names, or `undefined` for anything else. */
export function uniqueViolationConstraint(error: unknown): string | undefined {
  if (sqlState(error) !== UNIQUE_VIOLATION) return undefined;
  return findProperty(error, 'constraint');
}

/**
 * A client pinned to a role the database does not have is refused at connect,
 * before any query could tell the schema is absent — which is how an unapplied
 * database announces itself, since the roles are created by the schema apply.
 */
export function isMissingRole(error: unknown): boolean {
  if (sqlState(error) !== INVALID_PARAMETER_VALUE) return false;
  const message = errorMessages(error);
  return [TENANT_ROLES.app, TENANT_ROLES.maintenance].some((role) =>
    message.includes(role),
  );
}

/** The `_tag` of a `SqlError`'s reason, reached through drizzle's wrapper. */
function reasonTag(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) return undefined;
    if (Cause.isCause(current)) {
      current = Cause.squash(current);
      continue;
    }
    if (SqlError.isSqlError(current)) return current.reason._tag;
    if (!('cause' in current)) return undefined;
    current = current.cause;
  }
  return undefined;
}

/** The first `string` value of `key` anywhere down the cause chain. */
function findProperty(error: unknown, key: string): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) return undefined;
    if (Cause.isCause(current)) {
      current = Cause.squash(current);
      continue;
    }
    if (key in current) {
      const value: unknown = Reflect.get(current, key);
      if (Predicate.isString(value)) return value;
    }
    if (!('cause' in current)) return undefined;
    current = current.cause;
  }
  return undefined;
}

/**
 * Every message down the chain, joined. A missing role is named by the driver's
 * own message, which drizzle's wrapper replaces with the query text — so
 * reading only the top message would miss it.
 */
function errorMessages(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) break;
    if (Cause.isCause(current)) {
      current = Cause.squash(current);
      continue;
    }
    if ('message' in current && Predicate.isString(current.message)) {
      parts.push(current.message);
    }
    if (!('cause' in current)) break;
    current = current.cause;
  }
  return parts.join('\n');
}

/**
 * Every failure the data layer publishes is a `SqlError`, including the ones
 * the drizzle builder raises.
 *
 * The builder catches a statement's failure and re-raises it as an
 * `EffectDrizzleQueryError` whose `cause` is an Effect `Cause` around the
 * original `SqlError`, and **whose own message interpolates the query text and
 * every bind parameter**. Those parameters are the rows: an audit event's
 * labels and details, a participant's identifiers, a sealed secret's
 * ciphertext. Anything that logs such an error — a request log line, an
 * `ErrorReporter`, a test's failure output — would print them.
 *
 * Unwrapping to the `SqlError` underneath keeps the SQLSTATE that `sqlState`
 * and the predicates above read, and leaves the parameter dump out. It is the
 * one place that conversion happens, so no module can forget it and none can
 * do it differently.
 */
const asSqlError = (
  error: SqlError.SqlError | EffectDrizzleQueryError,
): SqlError.SqlError => {
  if (SqlError.isSqlError(error)) return error;
  const failure: unknown = Cause.isCause(error.cause)
    ? Cause.squash(error.cause)
    : error.cause;
  if (SqlError.isSqlError(failure)) return failure;
  return new SqlError.SqlError({
    reason: new SqlError.UnknownError({
      cause: failure ?? error,
      // Deliberately says nothing about the statement: the wrapper's own
      // message is what this function exists to drop.
      message: 'the query builder failed',
    }),
  });
};

/**
 * Applied to any span that reaches the database through the drizzle builder,
 * so its published error type is `SqlError` like every other.
 */
export const sqlErrorsOnly: <A, R>(
  self: Effect.Effect<A, SqlError.SqlError | EffectDrizzleQueryError, R>,
) => Effect.Effect<A, SqlError.SqlError, R> = Effect.mapError(asSqlError);

/**
 * `sqlErrorsOnly` for a span that publishes a **domain** failure beside its
 * database ones.
 *
 * The conversion is the same one `asSqlError` performs; what this adds is
 * passing the span's own typed failure through. `sqlErrorsOnly` is declared
 * over a channel of nothing but database errors, and most spans in the domain
 * answer with a domain failure as well — `ProtocolStoreError`,
 * `DraftStructureError`, a section-validation refusal. Without this such a
 * span would have to publish the drizzle wrapper unconverted, and that
 * wrapper's message interpolates the query text and every bind parameter.
 *
 * Both database shapes are recognised positively, so a domain error is
 * returned untouched rather than wrapped as an unknown query failure.
 *
 */
export const sqlErrorsOnlyBeside = <A, E, R>(
  self: Effect.Effect<A, E | SqlError.SqlError | EffectDrizzleQueryError, R>,
): Effect.Effect<A, E | SqlError.SqlError, R> =>
  Effect.mapError(self, (error): E | SqlError.SqlError =>
    SqlError.isSqlError(error) || error instanceof EffectDrizzleQueryError
      ? asSqlError(error)
      : error,
  );

/**
 * The most specific message in a failure's cause chain. `@effect/sql-pg` wraps
 * the driver error in a `SqlError` whose own message is always
 * `PgConnection: Query failed`, so the outermost `message` says nothing about
 * what went wrong — the useful one is the Postgres error underneath it. A
 * failure with no chain (a tagged error of our own) answers with its own.
 */
export function deepestMessage(value: unknown): string | undefined {
  let current: unknown = value;
  let deepest: string | undefined;
  while (Predicate.isObject(current)) {
    if (
      Predicate.hasProperty(current, 'message') &&
      Predicate.isString(current.message) &&
      current.message.length > 0
    ) {
      deepest = current.message;
    }
    if (!Predicate.hasProperty(current, 'cause')) break;
    current = current.cause;
  }
  return deepest;
}
