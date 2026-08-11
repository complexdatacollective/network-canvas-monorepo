import { createMiddleware } from 'hono/factory';

// Cross-site request forgery protection for the cookie plane (#1248):
// better-auth's own protections cover only /api/auth/*, so unsafe methods on
// every other cookie-principal surface are validated here. SameSite cookies
// remain defense-in-depth, not the mechanism.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Unsafe methods must provably come from our own origin: modern browsers
 * assert `Sec-Fetch-Site: same-origin` (or `none` for direct navigation);
 * otherwise an `Origin` header matching the configured browser-facing origin
 * is required. Requests that carry neither — including non-browser clients,
 * which belong on the token plane (#1288) — are refused.
 */
export function requireSameOrigin(baseUrl: string) {
  const allowedOrigin = new URL(baseUrl).origin;
  return createMiddleware(async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      await next();
      return;
    }
    const secFetchSite = c.req.header('sec-fetch-site');
    if (secFetchSite === 'same-origin' || secFetchSite === 'none') {
      await next();
      return;
    }
    if (
      secFetchSite === undefined &&
      c.req.header('origin') === allowedOrigin
    ) {
      await next();
      return;
    }
    return c.json({ title: 'Cross-origin request refused', status: 403 }, 403, {
      'Content-Type': 'application/problem+json',
    });
  });
}

/**
 * The WebSocket upgrade is a GET, so `requireSameOrigin` cannot gate it and
 * SameSite offers no protection on the handshake. Browsers always send
 * `Origin` on upgrade requests; anything else is not our SPA.
 */
export function requireWsOrigin(baseUrl: string) {
  const allowedOrigin = new URL(baseUrl).origin;
  return createMiddleware(async (c, next) => {
    if (c.req.header('origin') !== allowedOrigin) {
      return c.json(
        { title: 'Cross-origin request refused', status: 403 },
        403,
        { 'Content-Type': 'application/problem+json' },
      );
    }
    await next();
  });
}
