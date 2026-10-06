import { Layer } from 'effect';
import { type HttpRouter } from 'effect/http';
import { RpcSerialization, RpcServer } from 'effect/rpc';

import { RPC_PATH, StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import type { StudioEnv } from '../env.ts';
import type { RpcDeps, RpcServices } from '../rpc/deps.ts';
import { StudioRpcHandlers, StudioRpcMiddleware } from '../rpc/handlers.ts';
import { SetCookiesMiddleware } from '../rpc/set-cookies.ts';
import { boundedBody } from './body.ts';
import { requireSameOrigin } from './middleware/origin.ts';

export const RpcRoutes = (
  deps: RpcDeps,
  env: StudioEnv,
): Layer.Layer<never, never, RpcServices | HttpRouter.HttpRouter> => {
  // Outermost first: the CSRF gate, then the body bound.
  const guards =
    env.auth === undefined
      ? boundedBody.layer
      : boundedBody.combine(requireSameOrigin(env.auth.baseUrl)).layer;
  return RpcServer.layerHttp({
    group: StudioRpcs,
    path: RPC_PATH,
    protocol: 'http',
  }).pipe(
    Layer.provide(StudioRpcHandlers(deps)),
    Layer.provide(StudioRpcMiddleware(deps)),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(SetCookiesMiddleware.layer),
    Layer.provide(guards),
  );
};
