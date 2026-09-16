import { HttpApi, HttpApiSecurity, OpenApi } from 'effect/unstable/httpapi';

import { StatusApiGroup } from './groups/status.ts';

// The public `/api/v1` surface: declared here, mounted at stage 7.
//
// It is deliberately a different declaration from the rpc plane rather than a
// projection of it. `/rpc` is Studio's own client talking to Studio's own
// server and may change whenever both halves ship together; `/api/v1` is a
// surface third parties build against, so only what an instance is willing to
// promise indefinitely is added to a group here.
//
// The `/api/v1` prefix itself is not applied to the api. `HttpApi` does have a
// `.prefix()` method, so stage 7 can move the prefix here if the published
// OpenAPI paths should carry it; until the mount exists, applying it in both
// places would serve `/api/v1/api/v1/status`.

export const StudioApi = HttpApi.make('studio-v1')
  .add(StatusApiGroup)
  .annotate(OpenApi.Title, 'Network Canvas Studio API')
  .annotate(OpenApi.Version, 'v1');

/**
 * The OpenAPI document for the public surface, built on demand.
 *
 * A function rather than a constant because `OpenApi.fromApi` walks every
 * endpoint schema, and nothing should pay for that at import time — the
 * document is wanted by the docs route and by tests, not by the server's hot
 * path.
 */
export const openApiDocument = () => OpenApi.fromApi(StudioApi);

/**
 * #1248 placeholder: declared, referenced by nothing, so no security scheme is
 * published until an endpoint uses it.
 */
export const ScopedToken = HttpApiSecurity.bearer;
