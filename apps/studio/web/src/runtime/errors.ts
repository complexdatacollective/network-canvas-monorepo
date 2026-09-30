import { Predicate } from 'effect';
import { RpcClientError } from 'effect/unstable/rpc';

import {
  Conflict,
  Forbidden,
  Maintenance,
  NotFound,
  RateLimited,
} from '@codaco/studio-contract/schema/errors';

// Reading a refusal, whichever of the two planes made it.
//
// A handler's refusal is a typed error instance: the rpc response is HTTP 200
// with a `Failure` envelope, and `runPromiseExit` + `Cause.findErrorOption`
// hand the adapter the real class, so `instanceof` is sound.
//
// A refusal made BEFORE a handler sees the request — the maintenance gate, the
// origin check, an HTTP-level rate limit — never reaches the rpc plane at all.
// `runtime/runtime.ts`'s interceptor reads the status and the problem document
// below the protocol and attaches the refusal it names to the transport
// failure, which arrives here as an `RpcClientError`. `refusalOf` and
// `retryAfterSeconds` read both, so a caller never has to know which plane
// refused it.

/**
 * The three `instanceof` guards the screens branch on, replacing
 * `error instanceof ORPCError && error.code === 'FORBIDDEN'`.
 *
 * Deliberately direct: each is a type predicate, and a wrapped refusal is not
 * an instance of the class it carries — narrowing `unknown` to `Forbidden` for
 * an `RpcClientError` would be a lie. Reading across the planes is
 * `refusalOf`'s job, and it is the function a screen should use when what it
 * needs is "was this refused, and why".
 */
export const isForbidden = (error: unknown): error is Forbidden =>
  error instanceof Forbidden;

export const isConflict = (error: unknown): error is Conflict =>
  error instanceof Conflict;

export const isNotFound = (error: unknown): error is NotFound =>
  error instanceof NotFound;

/** What a caller is told about a refusal, from either plane. */
export type Refusal =
  | {
      readonly kind: 'rateLimited';
      readonly retryAfterSeconds: number | undefined;
    }
  | { readonly kind: 'maintenance' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'transport' }
  | undefined;

type RefusalInstance = Forbidden | Maintenance | NotFound | RateLimited;

const isRefusalInstance = (value: unknown): value is RefusalInstance =>
  value instanceof Forbidden ||
  value instanceof Maintenance ||
  value instanceof NotFound ||
  value instanceof RateLimited;

/**
 * The next link of a wrapped failure. An HTTP-plane refusal is nested exactly
 * three deep — `RpcClientError.reason` is the `HttpClientErrorSchema` the
 * protocol built, its `cause` is the `StatusCodeError` the interceptor failed
 * with, and that `cause` is the refusal instance — so `cause` is followed
 * first and `reason` second.
 */
const nextLink = (value: unknown): unknown => {
  if (Predicate.hasProperty(value, 'cause') && value.cause !== undefined) {
    return value.cause;
  }
  return Predicate.hasProperty(value, 'reason') ? value.reason : undefined;
};

/**
 * Bounded rather than "until it runs out": a `cause` chain is attacker-visible
 * data on the HTTP plane, and a cycle in it must not be a hung tab.
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

/**
 * The refusal an error reports, or `undefined` for an error that is not one.
 *
 * A transport failure carrying no refusal is still reported — as `transport` —
 * because a deployment-level refusal this end could not read is not the same
 * thing as "the request failed", and a screen that says so is telling a
 * researcher to retry something that cannot yet succeed.
 */
export const refusalOf = (error: unknown): Refusal => {
  const refusal = refusalInstance(error);
  if (refusal instanceof RateLimited) {
    return {
      kind: 'rateLimited',
      retryAfterSeconds: refusal.retryAfterSeconds,
    };
  }
  if (refusal instanceof Maintenance) return { kind: 'maintenance' };
  if (refusal instanceof Forbidden) return { kind: 'forbidden' };
  if (refusal instanceof NotFound) return { kind: 'notFound' };
  return error instanceof RpcClientError.RpcClientError
    ? { kind: 'transport' }
    : undefined;
};

/**
 * How long to wait before the call could succeed, in seconds, or `undefined`
 * when nothing said. Required on the contract's `RateLimited` and optional on
 * its `Maintenance` — a migration's length is unknown.
 */
export const retryAfterSeconds = (error: unknown): number | undefined => {
  const refusal = refusalInstance(error);
  if (refusal instanceof RateLimited) return refusal.retryAfterSeconds;
  if (refusal instanceof Maintenance) return refusal.retryAfterSeconds;
  return undefined;
};
