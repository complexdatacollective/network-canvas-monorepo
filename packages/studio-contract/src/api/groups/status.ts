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
 * `NotFoundResponse` is declared because a deployment can be configured
 * without the public API, and a request that reaches the router anyway has to
 * answer in the same problem+json shape as every other refusal.
 */
export const StatusApiGroup = HttpApiGroup.make('status').add(
  HttpApiEndpoint.get('get', '/status', {
    success: PublicInstanceStatus,
    error: NotFoundResponse,
  }),
);
