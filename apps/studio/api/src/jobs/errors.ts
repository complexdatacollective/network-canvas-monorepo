import { Cause, Exit, Option, Predicate } from 'effect';

const LOCK_NOT_AVAILABLE = '55P03';

export const INSUFFICIENT_PRIVILEGE = '42501';

export const FOREIGN_KEY_VIOLATION = '23503';

const UNIQUE_VIOLATION = '23505';

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

export function causeError(cause: Cause.Cause<unknown>): unknown {
  return (
    Option.getOrUndefined(Cause.findErrorOption(cause)) ?? Cause.squash(cause)
  );
}

export function exitSqlState(
  exit: Exit.Exit<unknown, unknown>,
): string | undefined {
  return Exit.isSuccess(exit) ? undefined : sqlState(causeError(exit.cause));
}

export { deepestMessage } from '../db/errors.ts';

export function isUniqueViolationCause(cause: Cause.Cause<unknown>): boolean {
  return sqlState(causeError(cause)) === UNIQUE_VIOLATION;
}

function isLockUnavailable(error: unknown): boolean {
  return sqlState(error) === LOCK_NOT_AVAILABLE;
}

export function isLockUnavailableCause(cause: Cause.Cause<unknown>): boolean {
  return isLockUnavailable(causeError(cause));
}
