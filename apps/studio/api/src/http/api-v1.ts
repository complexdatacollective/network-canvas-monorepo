import { createHash } from 'node:crypto';

import { Effect, Layer } from 'effect';
import {
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/unstable/httpapi';

import { API_V1_PATH, StudioApi } from '@codaco/studio-contract/api/v1';

import { type StatusApiDeps, StatusApiHandlers } from '../api/status.ts';
import { clientAddress, httpRateLimit } from './middleware/rate-limit.ts';

/** The router every route below registers on, with `API_V1_PATH` in front. */
const Mounted = Layer.effect(
  HttpRouter.HttpRouter,
  Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed(API_V1_PATH)),
);

/**
 * Every method on every path under `/api/v1` that is no route — the bare
 * prefix included — answers here rather than falling through to the Hono
 * residue, so that it is charged against the same limit as a real one. The
 * empty 404 becomes problem JSON in `ProblemJson`.
 *
 * `HEAD` is one of those methods: the router's fallback from `HEAD` to a `GET`
 * route only runs when nothing matches `HEAD` at all, and this does.
 */
const Unmatched = HttpRouter.use((router) =>
  router.add('*', '/*', HttpServerResponse.empty({ status: 404 })),
);

/**
 * The reference page is the same few megabytes on every request until the
 * next deploy, so it is compressed, cacheable for an hour, and revalidated
 * with an ETag: a repeat view costs a 304 rather than the page.
 *
 * The ETag is weak because the compressed and uncompressed representations
 * share it, and is computed once per response object — the page is built once
 * per process and handed out as the same object every time.
 */
const DOCS_CACHE_CONTROL = 'public, max-age=3600';

const etags = new WeakMap<HttpServerResponse.HttpServerResponse, string>();

const etagOf = (response: HttpServerResponse.HttpServerResponse) => {
  const known = etags.get(response);
  if (known !== undefined || response.body._tag !== 'Uint8Array') return known;
  const etag = `W/"${createHash('sha256').update(response.body.body).digest('base64url')}"`;
  etags.set(response, etag);
  return etag;
};

const matches = (ifNoneMatch: string, etag: string) =>
  ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .some(
      (candidate) =>
        candidate === '*' || candidate === etag.replace(/^W\//, ''),
    );

const CachedDocs = HttpRouter.middleware(
  Effect.gen(function* () {
    const platform = yield* HttpPlatform.HttpPlatform;
    const compress = HttpMiddleware.compression();
    return (httpEffect) =>
      compress(
        Effect.gen(function* () {
          const response = yield* httpEffect;
          const etag = etagOf(response);
          if (response.status !== 200 || etag === undefined) return response;
          const headers = { etag, 'cache-control': DOCS_CACHE_CONTROL };
          const request = yield* HttpServerRequest.HttpServerRequest;
          const ifNoneMatch = request.headers['if-none-match'];
          if (ifNoneMatch !== undefined && matches(ifNoneMatch, etag)) {
            return HttpServerResponse.empty({ status: 304, headers });
          }
          return HttpServerResponse.setHeaders(response, headers);
        }),
      ).pipe(Effect.provideService(HttpPlatform.HttpPlatform, platform));
  }),
);

/**
 * The public data API — a separate surface from the SPA's RPC, per the
 * 2026-08-11 decision on #1248 — served as an `HttpApi`, with its OpenAPI
 * document at `/api/v1/openapi.json` and a Scalar reference at
 * `/api/v1/docs`, all behind the `public_api` limit, and the page behind
 * `api_docs` as well.
 *
 * Paths match the way every Effect route does (`RouterConfig`'s defaults):
 * case-insensitively, with repeated slashes collapsed, a trailing slash
 * ignored and anything after a `;` dropped, so `/API/v1//status` is
 * `/api/v1/status`. Dot segments are not resolved: `/api/v1/./status` is no
 * route. Every alias is charged against the same limit.
 *
 * The reference page loads Scalar's bundle inline and its own fonts not at
 * all, so a researcher's browser fetches nothing from a third party to render
 * it.
 *
 * Limited per client address, and deliberately not per `Authorization` header
 * (#1909). There is no token plane yet — the principal resolution answers any
 * Authorization header with no principal until #1899 builds one — so a header
 * is an unvalidated string, and keying on it would let an anonymous caller
 * mint a fresh bucket per request by rotating the value, which is the address
 * limit doing nothing at all. When a token is validated the key becomes its
 * resolved id, which cannot be minted.
 */
export const ApiV1Routes = (deps: StatusApiDeps) =>
  Layer.mergeAll(
    HttpApiBuilder.layer(StudioApi, { openapiPath: '/openapi.json' }),
    HttpApiScalar.layer(StudioApi, {
      path: '/docs',
      scalar: { withDefaultFonts: false },
    }).pipe(
      Layer.provide(CachedDocs.layer),
      Layer.provide(httpRateLimit('api_docs', clientAddress).layer),
    ),
    Unmatched,
  ).pipe(
    Layer.provide(StatusApiHandlers(deps)),
    Layer.provide(Mounted),
    Layer.provide(httpRateLimit('public_api', clientAddress).layer),
  );
