import { Effect } from 'effect';

import { RateLimited } from '@codaco/studio-contract/schema/errors';

import { RateLimiter } from './limiter.ts';
import type { RateLimitScope } from './scopes.ts';

// No `Retry-After` header on this plane, by design: every Effect rpc response is
// HTTP 200, failures included. The interval travels on `RateLimited` instead.

export const enforceRateLimit = (
  scope: RateLimitScope,
  subject: string,
): Effect.Effect<void, RateLimited, RateLimiter> =>
  RateLimiter.use((limiter) =>
    Effect.flatMap(limiter.check(scope, subject), (decision) =>
      decision.allowed
        ? Effect.void
        : Effect.fail(
            new RateLimited({ retryAfterSeconds: decision.retryAfterSeconds }),
          ),
    ),
  );
