import { Effect, Option } from 'effect';
import { Headers, HttpServerRequest } from 'effect/unstable/http';
import { createMiddleware } from 'hono/factory';

import { AuthService, type Principal } from './service.ts';

// Who is calling, resolved from what a request carried (#1927 §12). One rule
// for every plane: the rpc middleware (`rpc/authenticated.ts`) asks it of the
// headers its transport received, and the HTTP gates ask it of the request.

/**
 * The cookie session a set of request headers resolves to, or none.
 *
 * An Authorization header puts the request on the token plane, which must
 * never fall back silently to cookies (#1248): the header's presence alone
 * answers none, without the session being consulted. Until #1288 lands, the
 * token plane resolves to no principal.
 */
export const principalFromHeaders = (
  headers: Headers.Headers,
): Effect.Effect<Option.Option<Principal>, never, AuthService> =>
  Headers.has(headers, 'authorization')
    ? Effect.succeedNone
    : AuthService.use((auth) => auth.getSession(headers));

/** The same resolution for an HTTP route, over the request being served. */
export const principalFromRequest: Effect.Effect<
  Option.Option<Principal>,
  never,
  AuthService | HttpServerRequest.HttpServerRequest
> = Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
  principalFromHeaders(request.headers),
);

export type PrincipalVariables = {
  Variables: { principal: Principal | null };
};

/**
 * The Hono residue's principal: `principalFromHeaders` over the raw request,
 * run against the process's auth service. It goes with the Hono app, when the
 * `/storage` and `/ws` gates move onto the Effect router and take
 * `principalFromRequest` instead.
 */
export function createPrincipalMiddleware(auth: AuthService['Service']) {
  return createMiddleware<PrincipalVariables>(async (c, next) => {
    const principal = await Effect.runPromise(
      Effect.provideService(
        principalFromHeaders(Headers.fromInput(c.req.raw.headers)),
        AuthService,
        auth,
      ),
    );
    c.set('principal', Option.getOrNull(principal));
    await next();
  });
}

/**
 * The RPC surface enforces this per-procedure inside its `Authenticated`
 * middleware; this covers routes outside it — the WebSocket upgrade and the
 * unsafe `/storage` methods.
 */
export function requirePrincipal() {
  return createMiddleware<PrincipalVariables>(async (c, next) => {
    if (!c.get('principal')) {
      return c.json({ title: 'Unauthorized', status: 401 }, 401, {
        'Content-Type': 'application/problem+json',
      });
    }
    await next();
  });
}
