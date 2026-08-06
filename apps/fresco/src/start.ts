import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';

/**
 * Replaces `next.config.ts`'s `headers()`. Creating this file opts out of the
 * automatically installed CSRF middleware, so it is re-added explicitly — Start
 * warns loudly at runtime if it is missing, but the warning is not a build
 * failure.
 */
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

const SECURITY_HEADERS = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains'],
] as const;

/**
 * Interview and onboard URLs carry the interview id, which is the
 * unauthenticated participant access capability. Send no Referer from these
 * routes so the id can never leak to third-party sub-resources.
 *
 * This is the `/interview/:path*` and `/onboard/:path*` pair from
 * `next.config.ts`. Prefix matching is exact about the segment boundary so
 * `/interviews-something` cannot pick up the weaker default by accident.
 */
function isParticipantPath(pathname: string) {
  for (const prefix of ['/interview', '/onboard']) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/**
 * Headers are written onto the *returned* response rather than through
 * `setResponseHeader` before `next()`, and that difference is the whole point.
 *
 * `setResponseHeader` writes to the ambient h3 response, which only survives
 * when the router streams a normal 200. A redirect (307) or a not-found (404)
 * is constructed as a fresh `Response`, so every header set before `next()` is
 * silently dropped — measured against this app: present on `/signin` (200) and
 * `/api/health` (200), absent on `/` and `/dashboard/interviews` (307) and on a
 * 404. Next's `headers()` in `next.config.ts` applies to every response
 * regardless of status, so the naive port quietly weakens rule 6 exactly where
 * it matters most: `/onboard/[protocolId]` is a route handler whose whole job
 * is to *redirect* into `/interview/[interviewId]`.
 *
 * Mutating the response after `next()` covers all three cases.
 *
 * (The singular `setResponseHeader` is used above for the same reason the
 * plural one is avoided everywhere: `setResponseHeaders` is declared as taking
 * `TypedHeaders<ResponseHeaderMap>` — a `Headers`-like object — while its body
 * iterates `Object.entries(headers)`. An actual `Headers` instance, the only
 * thing satisfying the type, enumerates nothing and sets no headers at all.)
 */
const securityHeadersMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ next }) => {
    const { pathname } = getRequestUrl();
    const result = await next();

    for (const [name, value] of SECURITY_HEADERS) {
      result.response.headers.set(name, value);
    }

    // Interview and onboard URLs carry the participant access capability.
    result.response.headers.set(
      'Referrer-Policy',
      isParticipantPath(pathname)
        ? 'no-referrer'
        : 'strict-origin-when-cross-origin',
    );

    return result;
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityHeadersMiddleware],
}));
