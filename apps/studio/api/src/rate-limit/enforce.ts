import { Effect, Redacted } from 'effect';

import { RateLimited } from '@codaco/studio-contract/schema/errors';

import { RateLimiter } from './limiter.ts';
import type { RateLimitScope } from './scopes.ts';

// No `Retry-After` header on this plane, by design: every Effect rpc response is
// HTTP 200, failures included. The interval travels on `RateLimited` instead.

export type RateLimitSubject = string | Redacted.Redacted;

export const rateLimitSubject = (subject: RateLimitSubject): string =>
  typeof subject === 'string' ? subject : Redacted.value(subject);

export const enforceRateLimit = (
  scope: RateLimitScope,
  subject: RateLimitSubject,
): Effect.Effect<void, RateLimited, RateLimiter> =>
  RateLimiter.use((limiter) =>
    Effect.flatMap(
      limiter.check(scope, rateLimitSubject(subject)),
      (decision) =>
        decision.allowed
          ? Effect.void
          : Effect.fail(
              new RateLimited({
                retryAfterSeconds: decision.retryAfterSeconds,
              }),
            ),
    ),
  );
