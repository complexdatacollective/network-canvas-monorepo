import { HttpApiEndpoint, HttpApiGroup, OpenApi } from 'effect/http-api';

import { NotFoundResponse } from '../../schema/errors.ts';
import { PublicInstanceStatus } from '../../schema/status.ts';

/**
 * `GET /status` on the public `/api/v1` surface.
 *
 * It answers with `PublicInstanceStatus`, not the richer `InstanceStatus` the
 * rpc plane serves: the narrower schema is what strips `auth`, `deployment`
 * and `setup` from the third-party surface, rather than a handler remembering
 * to delete them.
 *
 * `NotFoundResponse` is the endpoint's declared error, so the published
 * document carries the contract's RFC 9457 problem shape with
 * `application/problem+json` as its media type; the status and the media type
 * come from the class's own annotations. The refusals this route actually
 * answers today are not that shape: an unmatched path, the `public_api` 429
 * and the maintenance 503 are the server's plain `{ title, status }`
 * documents, and none of them is declared here.
 *
 * The operation id and summary are the ones the document has always
 * published, so a client generated from it keeps its method name.
 */
export const StatusApiGroup = HttpApiGroup.make('status').add(
  HttpApiEndpoint.get('get', '/status', {
    success: PublicInstanceStatus,
    error: NotFoundResponse,
  })
    .annotate(OpenApi.Identifier, 'status')
    .annotate(OpenApi.Summary, 'Instance status'),
);
