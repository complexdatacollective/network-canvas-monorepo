import { Layer } from 'effect';
import { type HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';

import { RPC_PATH, StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import type { StudioEnv } from '../env.ts';
import { AuthenticatedLive } from '../rpc/authenticated.ts';
import { ClientSessionMiddlewareLive } from '../rpc/client-session.ts';
import type { RpcDeps, StudioServices } from '../rpc/deps.ts';
import { StudioRpcHandlers } from '../rpc/handlers.ts';
import { SetCookiesMiddleware } from '../rpc/set-cookies.ts';
import { TeamAdministrationLive } from '../rpc/team-administration.ts';
import { SameOrigin } from './middleware/same-origin.ts';

/**
 * `POST /rpc`: the SPA's twenty procedures, served by Effect's rpc server over
 * ndjson.
 *
 * ndjson rather than JSON because the framing is what lets a response be a
 * stream: a batch's results leave as they finish, and the streaming procedures
 * #1899 and stage 8 add need no second transport. One `RpcServer.layerHttp`
 * registers the POST route on the shell's own router, so the request goes
 * through the same global middlewares (problem JSON, request id, client
 * address) as every other route.
 *
 * The two route-scoped middlewares are provided here rather than registered
 * globally, because both are about this route: `SetCookiesMiddleware` gives the
 * request the holder `setup.complete` signs a browser in through, and
 * `SameOrigin` is the cookie plane's CSRF gate, which only applies where a
 * cookie is a credential. `RpcServer` registers its route while these are in
 * its build context, so the route captures them.
 */
export const RpcRoutes = (
  deps: RpcDeps,
  env: StudioEnv,
): Layer.Layer<never, never, StudioServices | HttpRouter.HttpRouter> => {
  const served = RpcServer.layerHttp({
    group: StudioRpcs,
    path: RPC_PATH,
    protocol: 'http',
  }).pipe(
    Layer.provide(StudioRpcHandlers(deps)),
    Layer.provide(AuthenticatedLive(deps.auth)),
    Layer.provide(TeamAdministrationLive(deps)),
    Layer.provide(ClientSessionMiddlewareLive),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(SetCookiesMiddleware.layer),
  );
  // Exactly where `app.ts` applied `requireSameOrigin('/rpc/*')`: an instance
  // with no auth configured has no cookie to forge a call with.
  return env.auth === undefined
    ? served
    : served.pipe(Layer.provide(SameOrigin(env.auth.baseUrl).layer));
};
