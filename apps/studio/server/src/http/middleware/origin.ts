import { Effect } from 'effect';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';

// Cross-site request forgery protection for the cookie plane (#1248):
// better-auth's own protections cover only /api/auth/*, so unsafe methods on
// every other cookie-principal surface are validated here. SameSite cookies
// remain defense-in-depth, not the mechanism.
//
// Route-scoped rather than global: the gate only means something where a
// cookie is a credential, so each surface that takes one provides it — `/rpc`,
// the unsafe `/storage` methods and the `/ws` upgrade. Both gates answer with a
// response rather than failing: a router middleware may not handle errors, and
// a refusal a caller cannot read is not a refusal.

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

const refused = () =>
  HttpServerResponse.jsonUnsafe(
    { title: 'Cross-origin request refused', status: 403 },
    { status: 403, contentType: 'application/problem+json' },
  );

/**
 * Unsafe methods must provably come from our own origin: modern browsers
 * assert `Sec-Fetch-Site: same-origin` (or `none` for direct navigation);
 * otherwise an `Origin` header matching the configured browser-facing origin
 * is required. Requests that carry neither — including non-browser clients,
 * which belong on the token plane (#1288) — are refused.
 */
export const requireSameOrigin = (baseUrl: string) => {
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
      return refused();
    }),
  );
};

/**
 * The WebSocket upgrade is a GET, so `requireSameOrigin` cannot gate it and
 * SameSite offers no protection on the handshake. Browsers always send
 * `Origin` on upgrade requests; anything else is not our SPA.
 */
export const requireWsOrigin = (baseUrl: string) => {
  const allowedOrigin = new URL(baseUrl).origin;
  return HttpRouter.middleware((httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      if (request.headers['origin'] !== allowedOrigin) return refused();
      return yield* httpEffect;
    }),
  );
};
