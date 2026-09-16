import { randomUUID } from 'node:crypto';

import { Effect, Option } from 'effect';
import type pg from 'pg';

import { RateLimited } from '@codaco/studio-contract/schema/errors';

import { RequestId } from '../http/middleware/request-id.ts';
import type { RateLimiter } from '../rate-limit.ts';
import type { RateLimitScope } from '../rate-limit/scopes.ts';
import type { SecretsCipher } from '../secrets/cipher.ts';
import type { RpcDeps } from './deps.ts';

// What every bridged handler is built out of while the commands behind `/rpc`
// are still Promises (#1930, stage 2b: no store or command rewrite — that is
// stage 3).

/**
 * Runs one of today's Promise commands and turns what it throws into the
 * procedure's declared refusal.
 *
 * `refusal` decides: it returns the tagged error for a domain refusal it
 * recognises, and `Effect.die(cause)` for everything else. Nothing is
 * swallowed — a cause no mapper claims is a fault, and a fault must not arrive
 * as a refusal a client could act on.
 */
export const runCommand = <A, E>(
  work: () => Promise<A>,
  refusal: (cause: unknown) => Effect.Effect<never, E>,
): Effect.Effect<A, E> =>
  Effect.tryPromise({ try: work, catch: (cause: unknown) => cause }).pipe(
    Effect.catch(refusal),
  );

/**
 * The id this call is known by in logs and in audit rows.
 *
 * Read from the request when there is one — `RequestIdLive` mints it per HTTP
 * request — and minted here when there is not, which is the case for a client
 * that talks to the handlers in process (the test harness, and anything else
 * that skips the transport). That is the same fallback `app.ts` has always
 * applied.
 */
export const requestIdOrMint: Effect.Effect<string> = Effect.flatMap(
  Effect.serviceOption(RequestId),
  Option.match({
    onNone: () => Effect.sync(() => randomUUID()),
    onSome: (requestId: string) => Effect.succeed(requestId),
  }),
);

/**
 * A router wired without a database is a deployment bug rather than an
 * authorization refusal — the reading today's `INTERNAL_SERVER_ERROR` already
 * had — so it is a defect and never a declared error.
 */
export const requirePool = (deps: RpcDeps): Effect.Effect<pg.Pool> =>
  deps.pool === undefined
    ? Effect.die(new Error('the rpc plane was wired without a database pool'))
    : Effect.succeed(deps.pool);

/**
 * A protocol store can seal, so it always takes the cipher. A plane wired
 * without one is the same kind of deployment bug the pool is.
 */
export const requireCipher = (deps: RpcDeps): Effect.Effect<SecretsCipher> =>
  deps.cipher === undefined
    ? Effect.die(new Error('the rpc plane was wired without a secrets cipher'))
    : Effect.succeed(deps.cipher);

/**
 * Refuses a call whose scope has spent its window (#1909), with the contract's
 * `RateLimited` carrying the interval to wait.
 *
 * There is no `Retry-After` header any more, by design: an rpc-plane refusal is
 * a typed failure inside a 200 response, so the number travels in the error
 * where both transports can read it. A limit enforced at the HTTP layer still
 * answers problem+json with the header.
 */
export const chargeLimit = (
  limiter: RateLimiter | undefined,
  scope: RateLimitScope,
  subject: string,
): Effect.Effect<void, RateLimited> =>
  limiter === undefined
    ? Effect.void
    : Effect.flatMap(
        Effect.promise(() => limiter.check(scope, subject)),
        (decision) =>
          decision.allowed
            ? Effect.void
            : new RateLimited({
                retryAfterSeconds: decision.retryAfterSeconds,
              }),
      );
