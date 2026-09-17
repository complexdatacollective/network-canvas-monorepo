import { Cause, Predicate } from 'effect';
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
 * it (`effect/unstable/sql/SqlError.ts` maps the state to `LockTimeoutError`).
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
      const value = (current as Record<string, unknown>)[key];
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
