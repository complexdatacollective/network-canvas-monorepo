import { Cause, Exit, Option, Predicate } from 'effect';

// Reading a SQLSTATE back out of an Effect failure. `@effect/sql-pg` classifies
// a driver error into a `SqlError` reason — `LockTimeoutError`,
// `AuthorizationError` and so on — but the reasons are coarser than the codes
// the queue and the delivery handler act on, and the reason for `55P03` on
// rc.115 is `UnknownError`. The original driver error is still in the cause
// chain, so the code is read off that, the way
// `src/__tests__/support/postgres.ts` reads it today.
//
// #1927 §9 plans `sqlState(error)` as a stage-3 helper over drizzle's wrapper
// as well; this is the same function with one fewer wrapper to walk.

/** `lock_not_available`: the statement asked not to wait, and would have. */
const LOCK_NOT_AVAILABLE = '55P03';

/** `insufficient_privilege`. */
export const INSUFFICIENT_PRIVILEGE = '42501';

/** `foreign_key_violation`. */
export const FOREIGN_KEY_VIOLATION = '23503';

/** `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/**
 * The SQLSTATE a value carries, wherever in its cause chain it sits. Read
 * through the chain rather than off the top: a missing `code` would otherwise
 * read the same as a privilege error that never happened.
 */
function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
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
}

/** The failure a `Cause` carries — its typed error, or its defect. */
export function causeError(cause: Cause.Cause<unknown>): unknown {
  return (
    Option.getOrUndefined(Cause.findErrorOption(cause)) ?? Cause.squash(cause)
  );
}

/** The SQLSTATE a failed `Exit` carries, if it carries one. */
export function exitSqlState(
  exit: Exit.Exit<unknown, unknown>,
): string | undefined {
  return Exit.isSuccess(exit) ? undefined : sqlState(causeError(exit.cause));
}

// `deepestMessage` lives in `db/errors.ts`, beside the rest of the reading of
// a database failure, and is re-exported here because this module is where the
// queue's handlers look for one. One definition: the shape it walks is the
// same whichever caller asks.
export { deepestMessage } from '../db/errors.ts';

/**
 * True when a `Cause` carries a unique-index violation.
 *
 * The claim's singleton guard is two things at once: a `NOT EXISTS` that keeps
 * the claim from trying, and the partial unique index that makes it impossible
 * when two workers pass the `NOT EXISTS` together. The index is what raises,
 * and the loser has to read that as "nothing to claim" rather than as an error
 * — exactly as pg-boss's `fetch` tolerates `23505` from its own policy indexes
 * and returns an empty fetch (12.31.1 `dist/manager.js:1131-1141`).
 */
export function isUniqueViolationCause(cause: Cause.Cause<unknown>): boolean {
  return sqlState(causeError(cause)) === UNIQUE_VIOLATION;
}

/** True when the statement asked not to wait for a lock and would have. */
function isLockUnavailable(error: unknown): boolean {
  return sqlState(error) === LOCK_NOT_AVAILABLE;
}

/** The same question of a whole `Cause`, which is what an `Exit` carries. */
export function isLockUnavailableCause(cause: Cause.Cause<unknown>): boolean {
  return isLockUnavailable(causeError(cause));
}
