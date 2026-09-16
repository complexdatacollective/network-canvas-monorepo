import { ORPCError } from '@orpc/server';

import type { RateLimiter } from '../rate-limit.ts';
import type { RateLimitScope } from './scopes.ts';

// Refusing an oRPC call whose scope has spent its window (#1909).
//
// One caller is left: `src/protocol-builder/router.ts`, the only oRPC router
// still served — and served over the WebSocket alone until stage 8 mounts it
// on the rpc plane. Every researcher procedure now charges its limits on the
// Effect plane instead and refuses with the contract's `RateLimited`
// (`src/rpc/bridge.ts`'s `chargeLimit`).
//
// It takes the response headers rather than the whole `RpcContext` because
// `src/rpc.ts` owns that type and imports the protocol-builder router, so a
// helper shaped around the context could not be imported back.

/**
 * The retry interval goes in the error's data, which is what a caller over the
 * WebSocket has: a frame carries no response headers at all.
 *
 * @param resHeaders always `undefined` from the one caller, for that reason.
 *   It stays a parameter because stage 8's unary `/rpc/protocol-builder` mount
 *   is where a response to put `Retry-After` on appears.
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
