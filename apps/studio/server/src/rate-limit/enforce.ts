import { ORPCError } from '@orpc/server';

import type { RateLimiter } from '../rate-limit.ts';
import type { RateLimitScope } from './scopes.ts';

// Refusing an oRPC call whose scope has spent its window (#1909).
//
// It takes the response headers rather than the whole `RpcContext` so that it
// can be used from both routers: `src/rpc.ts` owns that type and imports
// `src/protocol-builder/router.ts`, so a helper shaped around the context
// could not be shared with the router that needs it most.

/**
 * `Retry-After` goes on the response through oRPC's `ResponseHeadersPlugin`,
 * and the same number goes in the error's data — which is what a caller over
 * the WebSocket has, because a frame carries no headers. A client reads one or
 * the other without having to know which transport it is on.
 *
 * @param resHeaders absent for a call that arrived over the socket.
 */
export async function enforceRateLimit(
  limiter: RateLimiter | undefined,
  scope: RateLimitScope,
  subject: string,
  resHeaders: Headers | undefined,
): Promise<void> {
  if (!limiter) return;
  const decision = await limiter.check(scope, subject);
  if (decision.allowed) return;
  resHeaders?.set('Retry-After', String(decision.retryAfterSeconds));
  throw new ORPCError('TOO_MANY_REQUESTS', {
    data: { retryAfter: decision.retryAfterSeconds },
  });
}
