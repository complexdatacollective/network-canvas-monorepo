import { Effect, Option } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/http';

import { RateLimiter } from '../../rate-limit/limiter.ts';
import type { RateLimitScope } from '../../rate-limit/scopes.ts';
import { ClientAddress, UNKNOWN_ADDRESS } from './client-address.ts';

export const tooManyRequests = (retryAfterSeconds: number) =>
  HttpServerResponse.jsonUnsafe(
    { title: 'Too Many Requests', status: 429 },
    {
      status: 429,
      contentType: 'application/problem+json',
      headers: { 'retry-after': String(retryAfterSeconds) },
    },
  );

export const clientAddress: Effect.Effect<string> = Effect.map(
  Effect.serviceOption(ClientAddress),
  Option.getOrElse(() => UNKNOWN_ADDRESS),
);

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
