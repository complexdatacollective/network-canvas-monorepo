import { Effect } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http';

// CSRF protection for the cookie plane: better-auth's own protections cover
// only /api/auth/*.

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

const refused = () =>
  HttpServerResponse.jsonUnsafe(
    { title: 'Cross-origin request refused', status: 403 },
    { status: 403, contentType: 'application/problem+json' },
  );

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
 * SameSite offers no protection on the handshake.
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
