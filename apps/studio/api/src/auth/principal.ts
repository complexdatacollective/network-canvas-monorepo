import { Effect, type Option } from 'effect';
import { Headers, HttpServerRequest } from 'effect/http';

import { AuthService, type Principal } from './service.ts';

/**
 * An Authorization header must never fall back silently to cookies: its
 * presence alone answers none.
 */
export const principalFromHeaders = (
  headers: Headers.Headers,
): Effect.Effect<Option.Option<Principal>, never, AuthService> =>
  Headers.has(headers, 'authorization')
    ? Effect.succeedNone
    : AuthService.use((auth) => auth.getSession(headers));

export const principalFromRequest: Effect.Effect<
  Option.Option<Principal>,
  never,
  AuthService | HttpServerRequest.HttpServerRequest
> = Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
  principalFromHeaders(request.headers),
);
