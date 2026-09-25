import { randomUUID } from 'node:crypto';

import { Effect, Option } from 'effect';
import type pg from 'pg';

import { RequestId } from '../http/middleware/request-id.ts';
import type { RpcDeps } from './deps.ts';

// What every `/rpc` handler is built out of.
//
// `runCommand` — the `Effect.tryPromise` every handler wrapped a Promise
// command in — went with the last Promise command (#1927 stage 3). A command
// is an Effect now, so a handler maps its declared failures with
// `Effect.catch` and dies on the rest, in its own file where the mapping
// belongs.

/**
 * The id this call is known by in logs and in audit rows.
 *
 * Read from the request when there is one — `RequestIdLive` mints it per HTTP
 * request — and minted here when there is not, which is the case for a client
 * that talks to the handlers in process (the test harness, and anything else
 * that skips the transport). That is the same fallback `app.ts` has always
 * applied.
 */
const requestIdOrMint: Effect.Effect<string> = Effect.flatMap(
  Effect.serviceOption(RequestId),
  Option.match({
    onNone: () => Effect.sync(() => randomUUID()),
    onSome: (requestId: string) => Effect.succeed(requestId),
  }),
);

/**
 * Runs a command under this call's request id.
 *
 * `audited` requires `RequestId` rather than reading an option, because an
 * audit row without one is not a record anybody can follow back. This is where
 * the requirement is met: from the HTTP request where there is one, and from a
 * fresh id where there is not — a call over the WebSocket, or in process,
 * which is the same fallback `requestIdOrMint` has always applied.
 */
export const withRequestId = <A, E, R>(
  command: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, Exclude<R, RequestId>> =>
  Effect.flatMap(requestIdOrMint, (requestId) =>
    Effect.provideService(command, RequestId, requestId),
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
