import { EffectDrizzleQueryError } from 'drizzle-orm/effect-core';
import { Cause, Effect, type LogLevel, Predicate } from 'effect';
import { SqlError } from 'effect/sql';

import { TENANT_ROLES } from '@codaco/studio-sync/rls';

const LOCK_NOT_AVAILABLE = '55P03';
const UNIQUE_VIOLATION = '23505';
const INVALID_PARAMETER_VALUE = '22023';

export function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (!Predicate.isObject(current)) return undefined;
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

export function isLockUnavailable(error: unknown): boolean {
  if (sqlState(error) === LOCK_NOT_AVAILABLE) return true;
  return reasonTag(error) === 'LockTimeoutError';
}

export function uniqueViolationConstraint(error: unknown): string | undefined {
  if (sqlState(error) !== UNIQUE_VIOLATION) return undefined;
  return findProperty(error, 'constraint');
}

export function isMissingRole(error: unknown): boolean {
  if (sqlState(error) !== INVALID_PARAMETER_VALUE) return false;
  const message = errorMessages(error);
  return [TENANT_ROLES.app, TENANT_ROLES.maintenance].some((role) =>
    message.includes(role),
  );
}

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
 * drizzle's `EffectDrizzleQueryError` message interpolates the query text and
 * every bind parameter, so it is never published unconverted.
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
      message: 'the query builder failed',
    }),
  });
};

export const sqlErrorsOnly: <A, R>(
  self: Effect.Effect<A, SqlError.SqlError | EffectDrizzleQueryError, R>,
) => Effect.Effect<A, SqlError.SqlError, R> = Effect.mapError(asSqlError);

export const sqlErrorsOnlyBeside = <A, E, R>(
  self: Effect.Effect<A, E | SqlError.SqlError | EffectDrizzleQueryError, R>,
): Effect.Effect<A, E | SqlError.SqlError, R> =>
  Effect.mapError(self, (error): E | SqlError.SqlError =>
    SqlError.isSqlError(error) || error instanceof EffectDrizzleQueryError
      ? asSqlError(error)
      : error,
  );

/**
 * `@effect/sql-pg`'s `SqlError` message is always `PgConnection: Query failed`;
 * the useful one is the Postgres error underneath it.
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

const failedReadingLevel = (cause: Cause.Cause<unknown>): LogLevel.Severity =>
  isMissingRole(cause) ? 'Debug' : 'Warn';

export const failureCodes = (failure: unknown): Record<string, string> => {
  const error = Cause.isCause(failure) ? Cause.squash(failure) : failure;
  const type =
    Predicate.hasProperty(error, '_tag') && Predicate.isString(error._tag)
      ? error._tag
      : error instanceof Error
        ? error.name
        : typeof error;
  const state = sqlState(error);
  return state === undefined
    ? { error_type: type }
    : { error_type: type, sql_state: state };
};

/**
 * What a reading taken on a timer logs when it fails: one line naming the
 * failure, with the stack at debug, not the stack in the line. A process that
 * waits on a database that has never been provisioned fails every such reading
 * for as long as it waits; the schema gate has already said so once, with the
 * remedy, so a missing role is debug as well rather than one more warning per
 * reading, each carrying a stack trace (#1901).
 */
export const logFailedReading = (
  log: (level: LogLevel.Severity) => Effect.Effect<void>,
  cause: Cause.Cause<unknown>,
): Effect.Effect<void> =>
  Effect.andThen(
    log(failedReadingLevel(cause)).pipe(
      Effect.annotateLogs(failureCodes(cause)),
    ),
    Effect.logDebug('The failed reading’s cause', cause),
  );
