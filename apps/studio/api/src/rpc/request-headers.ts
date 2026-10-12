import { Effect, Option } from 'effect';
import type { Headers } from 'effect/http';
import { HttpServerRequest } from 'effect/http';

/**
 * The HTTP request's own headers: in the merged set a middleware is handed, a
 * message's own headers win over the request's.
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
