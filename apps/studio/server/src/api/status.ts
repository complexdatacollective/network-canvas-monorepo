import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { StudioApi } from '@codaco/studio-contract/api/v1';

import { getInstanceStatus } from '../domain.ts';
import type { RpcDeps } from '../rpc/deps.ts';

/** What `GET /api/v1/status` reads: the same three inputs the rpc `status` does. */
export type StatusApiDeps = Pick<
  RpcDeps,
  'capabilities' | 'deployment' | 'readInstallation'
>;

/**
 * The public surface's `status` group.
 *
 * The handler returns the domain's whole status document; the group's success
 * schema is `PublicInstanceStatus`, which encodes `name` and `version` and
 * drops the rest, so the output schema is the serialization allowlist (#1248).
 */
export const StatusApiHandlers = (deps: StatusApiDeps) =>
  HttpApiBuilder.group(StudioApi, 'status', (handlers) =>
    handlers.handle('get', () =>
      Effect.promise(async () =>
        getInstanceStatus(
          deps.capabilities,
          deps.deployment,
          await deps.readInstallation(),
        ),
      ),
    ),
  );
