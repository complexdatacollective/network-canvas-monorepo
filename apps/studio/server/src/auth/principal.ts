import { createMiddleware } from 'hono/factory';

import type { AuthService, Principal } from './service.ts';

// The one place a request becomes a principal (#1248): downstream handlers
// never know which plane authenticated. Today only the cookie plane exists;
// scoped API tokens (#1288) will extend this resolver, not add another.

export type PrincipalVariables = {
  Variables: { principal: Principal | null };
};

export function createPrincipalMiddleware(auth: AuthService) {
  return createMiddleware<PrincipalVariables>(async (c, next) => {
    // An Authorization header puts the request on the token plane, which
    // must never fall back silently to cookies (#1248). Until #1288 lands,
    // the token plane resolves to no principal.
    if (c.req.header('authorization') !== undefined) {
      c.set('principal', null);
    } else {
      c.set('principal', await auth.getSession(new Headers(c.req.raw.headers)));
    }
    await next();
  });
}

/**
 * Refuse the request when no principal resolved. The RPC surface enforces
 * this per-procedure inside oRPC; this middleware covers routes outside it —
 * currently the WebSocket upgrade.
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
