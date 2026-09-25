import { Effect, Option } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

import { RateLimiter } from '../../rate-limit/limiter.ts';
import type { RateLimitScope } from '../../rate-limit/scopes.ts';
import { ClientAddress, UNKNOWN_ADDRESS } from './client-address.ts';

// The limits an HTTP status answers (#1909): `public_api`, `storage_read` and
// `ws_upgrade` here, and `sign_in_email` inside the auth mount, which has to
// read the body to know its subject. The rpc plane's scopes are charged by its
// own middleware and answer the contract's `RateLimited` instead, because an
// rpc response is HTTP 200 whatever it carries.

/**
 * What every refused request answers, in the shape the rest of the API uses.
 * The response says nothing the limiter's own log does not: the scope's
 * refusal and how long to wait — never the subject being refused.
 */
export const tooManyRequests = (retryAfterSeconds: number) =>
  HttpServerResponse.jsonUnsafe(
    { title: 'Too Many Requests', status: 429 },
    {
      status: 429,
      contentType: 'application/problem+json',
      headers: { 'retry-after': String(retryAfterSeconds) },
    },
  );

/**
 * The address the global middleware resolved for this request. A route the
 * middleware did not reach — none, in the composed router, but the fallback
 * is what the Hono residue always read — shares the one bucket every
 * unidentifiable caller shares, which is the safe direction.
 */
export const clientAddress: Effect.Effect<string> = Effect.map(
  Effect.serviceOption(ClientAddress),
  Option.getOrElse(() => UNKNOWN_ADDRESS),
);

/**
 * One charge against `scope` per request, keyed by whatever `subject`
 * resolves to, before the route runs.
 *
 * A route middleware, so `subject` may ask for what an outer middleware
 * provides — the `/ws` upgrade keys its limit by the principal the gate
 * outside this one resolved. The limiter is read when the route is
 * registered, because a middleware function is handed nothing but the
 * request.
 */
export const httpRateLimit = <R>(
  scope: RateLimitScope,
  subject: Effect.Effect<string, never, R>,
) =>
  HttpRouter.middleware(
    Effect.gen(function* () {
      const limiter = yield* RateLimiter;
      return (httpEffect) =>
        Effect.gen(function* () {
          const decision = yield* limiter.check(scope, yield* subject);
          if (!decision.allowed) {
            return tooManyRequests(decision.retryAfterSeconds);
          }
          return yield* httpEffect;
        });
    }),
  );
