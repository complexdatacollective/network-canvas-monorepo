import { HttpApi, HttpApiSecurity, OpenApi } from 'effect/unstable/httpapi';

import { StatusApiGroup } from './groups/status.ts';

// The public `/api/v1` surface.
//
// It is deliberately a different declaration from the rpc plane rather than a
// projection of it. `/rpc` is Studio's own client talking to Studio's own
// server and may change whenever both halves ship together; `/api/v1` is a
// surface third parties build against, so only what an instance is willing to
// promise indefinitely is added to a group here.

/** Where `StudioApi` is served. */
export const API_V1_PATH = '/api/v1';

/**
 * The api's paths are relative to `API_V1_PATH` rather than prefixed with it,
 * and the published document names the mount as its server, which is the
 * shape `/api/v1/openapi.json` has always had: a client generated from it
 * resolves `/status` against the server entry. The server mounts the api on a
 * router prefixed with the same constant.
 */
export const StudioApi = HttpApi.make('studio-v1')
  .add(StatusApiGroup)
  .annotate(OpenApi.Title, 'Network Canvas Studio API')
  .annotate(OpenApi.Version, 'v1')
  .annotate(OpenApi.Servers, [{ url: API_V1_PATH }]);

/**
 * The OpenAPI document for the public surface, built on demand.
 *
 * A function rather than a constant because `OpenApi.fromApi` walks every
 * endpoint schema, and nothing should pay for that at import time.
 */
export const openApiDocument = () => OpenApi.fromApi(StudioApi);

/**
 * #1248 placeholder: declared, referenced by nothing, so no security scheme is
 * published until an endpoint uses it.
 */
export const ScopedToken = HttpApiSecurity.bearer;
