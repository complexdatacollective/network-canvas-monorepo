import { Effect, Schema } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';

import { StudioApi } from '@codaco/studio-contract/api/v1';
import { PublicInstanceStatus } from '@codaco/studio-contract/schema/status';

import { getInstanceStatus } from '../domain.ts';
import type { RpcDeps } from '../rpc/deps.ts';

export type StatusApiDeps = Pick<
  RpcDeps,
  'capabilities' | 'deployment' | 'readInstallation'
>;

/**
 * `HttpApiBuilder` answers a success that fails to encode with the same 400 it
 * gives a request that fails to decode, so the handler checks its own answer first.
 */
const publicStatus = Schema.decodeUnknownEffect(PublicInstanceStatus);

export const StatusApiHandlers = (deps: StatusApiDeps) =>
  HttpApiBuilder.group(StudioApi, 'status', (handlers) =>
    handlers.handle('get', () =>
      Effect.map(deps.readInstallation, (installation) =>
        getInstanceStatus(deps.capabilities, deps.deployment, installation),
      ).pipe(Effect.flatMap(publicStatus), Effect.orDie),
    ),
  );
