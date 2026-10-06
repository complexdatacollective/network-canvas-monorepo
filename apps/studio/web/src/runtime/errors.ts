import { Predicate } from 'effect';
import { RpcClientError } from 'effect/rpc';

import {
  Conflict,
  Forbidden,
  Maintenance,
  NotFound,
  RateLimited,
  Unauthorized,
} from '@codaco/studio-contract/schema/errors';

export const isForbidden = (error: unknown): error is Forbidden =>
  error instanceof Forbidden;

export const isConflict = (error: unknown): error is Conflict =>
  error instanceof Conflict;

export const isNotFound = (error: unknown): error is NotFound =>
  error instanceof NotFound;

export type Refusal =
  | {
      readonly kind: 'rateLimited';
      readonly retryAfterSeconds: number | undefined;
    }
  | { readonly kind: 'maintenance' }
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'transport' }
  | undefined;

type RefusalInstance =
  | Forbidden
  | Maintenance
  | NotFound
  | RateLimited
  | Unauthorized;

const isRefusalInstance = (value: unknown): value is RefusalInstance =>
  value instanceof Unauthorized ||
  value instanceof Forbidden ||
  value instanceof Maintenance ||
  value instanceof NotFound ||
  value instanceof RateLimited;

const nextLink = (value: unknown): unknown => {
  if (Predicate.hasProperty(value, 'cause') && value.cause !== undefined) {
    return value.cause;
  }
  return Predicate.hasProperty(value, 'reason') ? value.reason : undefined;
};

/**
 * Bounded: a `cause` chain is attacker-visible data, and a cycle must not hang the tab.
 */
const REFUSAL_CHAIN_LIMIT = 6;

const refusalInstance = (error: unknown): RefusalInstance | undefined => {
  let candidate = error;
  for (let step = 0; step < REFUSAL_CHAIN_LIMIT; step += 1) {
    if (isRefusalInstance(candidate)) return candidate;
    const next = nextLink(candidate);
    if (next === undefined) return undefined;
    candidate = next;
  }
  return undefined;
};

/** Every Retry-After becomes a timer, and `setTimeout` fires at once past 2^31-1 ms. */
const RETRY_AFTER_CEILING_SECONDS = 60 * 60;

const boundedSeconds = (value: number | undefined): number | undefined =>
  value === undefined || Number.isNaN(value) || value < 0
    ? undefined
    : Math.min(value, RETRY_AFTER_CEILING_SECONDS);

export const refusalOf = (error: unknown): Refusal => {
  const refusal = refusalInstance(error);
  if (refusal instanceof RateLimited) {
    return {
      kind: 'rateLimited',
      retryAfterSeconds: boundedSeconds(refusal.retryAfterSeconds),
    };
  }
  if (refusal instanceof Maintenance) return { kind: 'maintenance' };
  if (refusal instanceof Unauthorized) return { kind: 'unauthorized' };
  if (refusal instanceof Forbidden) return { kind: 'forbidden' };
  if (refusal instanceof NotFound) return { kind: 'notFound' };
  return error instanceof RpcClientError.RpcClientError
    ? { kind: 'transport' }
    : undefined;
};

export const retryAfterSeconds = (error: unknown): number | undefined => {
  const refusal = refusalInstance(error);
  if (refusal instanceof RateLimited) {
    return boundedSeconds(refusal.retryAfterSeconds);
  }
  if (refusal instanceof Maintenance) {
    return boundedSeconds(refusal.retryAfterSeconds);
  }
  return undefined;
};

const DELTA_SECONDS = /^\d+$/;

export const parseRetryAfter = (
  raw: string | null | undefined,
): number | undefined => {
  const value = raw?.trim();
  return value !== undefined && DELTA_SECONDS.test(value)
    ? boundedSeconds(Number(value))
    : undefined;
};
