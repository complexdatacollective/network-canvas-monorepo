import { Effect } from 'effect';

import { RateLimited } from '@codaco/studio-contract/schema/errors';

import { RateLimiter } from './limiter.ts';
import type { RateLimitScope } from './scopes.ts';

// Refusing an rpc call whose scope has spent its window (#1909).
//
// There is no `Retry-After` header on this plane, by design: every Effect rpc
// response is HTTP 200, failures included, so a header is not a channel here.
// The interval travels on the contract's `RateLimited` instead, where both
// transports can read it. A limit enforced at the HTTP layer — the auth mount,
// `public_api`, `storage_read`, `ws_upgrade` — still answers problem+json with
// the header, and builds that response itself.

/** Succeeds when the scope admits the call; fails with the interval to wait when it does not. */
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
