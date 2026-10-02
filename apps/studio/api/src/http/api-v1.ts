import { createHash } from 'node:crypto';

import { Effect, Layer } from 'effect';
import {
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/http-api';

import { API_V1_PATH, StudioApi } from '@codaco/studio-contract/api/v1';

import { type StatusApiDeps, StatusApiHandlers } from '../api/status.ts';
import { clientAddress, httpRateLimit } from './middleware/rate-limit.ts';

const Mounted = Layer.effect(
  HttpRouter.HttpRouter,
  Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed(API_V1_PATH)),
);

const Unmatched = HttpRouter.use((router) =>
  router.add('*', '/*', HttpServerResponse.empty({ status: 404 })),
);

/**
 * The ETag is weak because the compressed and uncompressed representations
 * share it.
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
 * Limited per client address, deliberately not per `Authorization` header: an
 * unvalidated header would let a caller mint a fresh bucket per request.
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
