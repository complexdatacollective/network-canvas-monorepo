import { Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/unstable/httpapi';

import { API_V1_PATH, StudioApi } from '@codaco/studio-contract/api/v1';

import { type StatusApiDeps, StatusApiHandlers } from '../api/status.ts';
import { clientAddress, httpRateLimit } from './middleware/rate-limit.ts';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** The router every route below registers on, with `API_V1_PATH` in front. */
const Mounted = Layer.effect(
  HttpRouter.HttpRouter,
  Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed(API_V1_PATH)),
);

/**
 * A path under `/api/v1` that is no route still answers here rather than
 * falling through to the Hono residue, so that it is charged against the same
 * limit as a real one. The empty 404 becomes problem JSON in `ProblemJson`.
 * `/*` registers the bare `/api/v1` beside its children.
 */
const Unmatched = HttpRouter.use((router) =>
  Effect.forEach(
    METHODS,
    (method) =>
      router.add(method, '/*', HttpServerResponse.empty({ status: 404 })),
    { discard: true },
  ),
);

/**
 * The public data API — a separate surface from the SPA's RPC, per the
 * 2026-08-11 decision on #1248 — served as an `HttpApi`, with its OpenAPI
 * document at `/api/v1/openapi.json` and a Scalar reference at
 * `/api/v1/docs`, all behind the `public_api` limit.
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
    HttpApiScalar.layer(StudioApi, { path: '/docs' }),
    Unmatched,
  ).pipe(
    Layer.provide(StatusApiHandlers(deps)),
    Layer.provide(Mounted),
    Layer.provide(httpRateLimit('public_api', clientAddress).layer),
  );
