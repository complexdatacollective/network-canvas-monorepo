import { Effect } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

// Cross-site request forgery protection for the cookie plane (#1248), as a
// route-scoped middleware rather than a Hono one: `/rpc` belongs to the Effect
// shell now, so the check that used to run as `requireSameOrigin('/rpc/*')`
// runs here instead. The decision is `auth/csrf.ts`'s, unchanged — the Hono
// version still gates `/storage`, which is stage 4's to move.
//
// Stage 4 replaces this with S6's origin middleware, which will gate every
// cookie-plane surface from one place.

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Unsafe methods must provably come from our own origin: modern browsers
 * assert `Sec-Fetch-Site: same-origin` (or `none` for direct navigation);
 * otherwise an `Origin` header matching the configured browser-facing origin is
 * required. Requests that carry neither — including non-browser clients, which
 * belong on the token plane (#1288) — are refused.
 *
 * It answers with a response rather than failing: a router middleware may not
 * handle errors, and a refusal a caller cannot read is not a refusal.
 */
export const SameOrigin = (baseUrl: string) => {
  const allowedOrigin = new URL(baseUrl).origin;
  return HttpRouter.middleware((httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (SAFE_METHODS.has(request.method)) return yield* httpEffect;
      const secFetchSite = request.headers['sec-fetch-site'];
      if (secFetchSite === 'same-origin' || secFetchSite === 'none') {
        return yield* httpEffect;
      }
      if (
        secFetchSite === undefined &&
        request.headers['origin'] === allowedOrigin
      ) {
        return yield* httpEffect;
      }
      return HttpServerResponse.jsonUnsafe(
        { title: 'Cross-origin request refused', status: 403 },
        { status: 403, contentType: 'application/problem+json' },
      );
    }),
  );
};
