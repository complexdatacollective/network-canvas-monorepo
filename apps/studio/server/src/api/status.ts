import { Effect, Schema } from 'effect';
import { HttpApiBuilder } from 'effect/unstable/httpapi';

import { StudioApi } from '@codaco/studio-contract/api/v1';
import { PublicInstanceStatus } from '@codaco/studio-contract/schema/status';

import { getInstanceStatus } from '../domain.ts';
import type { RpcDeps } from '../rpc/deps.ts';

/** What `GET /api/v1/status` reads: the same three inputs the rpc `status` does. */
export type StatusApiDeps = Pick<
  RpcDeps,
  'capabilities' | 'deployment' | 'readInstallation'
>;

/**
 * A document the server cannot encode is the server's fault. `HttpApiBuilder`
 * answers a success that fails to encode with the same 400 it gives a request
 * that fails to decode, so the handler checks its own answer first and dies
 * on a bad one, which answers 500.
 */
const publicStatus = Schema.decodeUnknownEffect(PublicInstanceStatus);

/**
 * The public surface's `status` group.
 *
 * `PublicInstanceStatus` names only `name` and `version`, so the domain's
 * `auth`, `deployment` and `setup` blocks are dropped here and again by the
 * group's success schema: the output schema is the serialization allowlist
 * (#1248).
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
      ).pipe(Effect.flatMap(publicStatus), Effect.orDie),
    ),
  );
