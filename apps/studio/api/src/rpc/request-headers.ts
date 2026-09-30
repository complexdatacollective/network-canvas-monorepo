import { Effect, Option } from 'effect';
import type { Headers } from 'effect/unstable/http';
import { HttpServerRequest } from 'effect/unstable/http';

/**
 * The headers an rpc middleware may speak for: the HTTP request's own, wherever
 * there is a request.
 *
 * A middleware is handed `requestHeaders.concat(message.headers)` (`RpcServer`,
 * the HTTP protocol's decode loop), and `Headers.fromInput` assigns in
 * iteration order — so a header a caller attached to the message itself with
 * `RpcClient.withHeaders` is written last and wins over the one the request
 * actually arrived with. The merged set is therefore fine for a procedure that
 * reads its own caller-supplied header, and wrong for anything a middleware
 * presents to something outside the plane as "what this request carried".
 *
 * No request means the in-process client (`__tests__/support/rpc.ts`), which
 * has no transport at all: there the message's headers are the only ones there
 * are, which is the same fallback `requestIdOrMint` makes for the request id.
 */
export const transportHeaders = (
  merged: Headers.Headers,
): Effect.Effect<Headers.Headers> =>
  Effect.map(
    Effect.serviceOption(HttpServerRequest.HttpServerRequest),
    Option.match({
      onNone: () => merged,
      onSome: (request) => request.headers,
    }),
  );
