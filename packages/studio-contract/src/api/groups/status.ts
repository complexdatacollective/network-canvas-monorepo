import { HttpApiEndpoint, HttpApiGroup } from 'effect/unstable/httpapi';

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
 * `NotFoundResponse` is the endpoint's declared error so the published
 * document carries the RFC 9457 problem shape every `/api/v1` refusal uses,
 * with `application/problem+json` as its media type. The status handler has
 * no refusal of its own today; stage 7 mounts the surface and decides what,
 * beyond the shape, this endpoint can answer with.
 */
export const StatusApiGroup = HttpApiGroup.make('status').add(
  HttpApiEndpoint.get('get', '/status', {
    success: PublicInstanceStatus,
    error: NotFoundResponse,
  }),
);
