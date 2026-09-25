import type { Principal } from './auth/service.ts';
import { createProtocolBuilderRouter } from './protocol-builder/router.ts';
import type { ProtocolBuilderRuntime } from './protocol-builder/runtime.ts';
import type { RpcDeps } from './rpc/deps.ts';

// What is left of the oRPC router behind `/rpc`.
//
// The twenty researcher-facing procedures are Effect rpc handlers now
// (`src/rpc/handlers/*.ts`), served at `/rpc` by `src/http/rpc-routes.ts`. The
// protocol builder's procedures stay here, on oRPC over the `/ws` bridge, until
// stage 8 gives them an `RpcGroup` of their own (#1930) — so this router is
// reached over the socket and nowhere else.

export type RpcContext = {
  principal: Principal | null;
  requestId: string;
  /**
   * The WebSocket this call arrived on, when it arrived on one. This is the
   * protocol-builder host's presence identity: a colleague's cursor belongs to
   * a connection and goes when the connection does.
   */
  connectionId?: string;
  /**
   * The browser tab behind this call, when it named one — see
   * `@codaco/studio-contract/client-session`. A protocol-builder lock belongs to
   * this rather than to the connection, so two tabs of one researcher are two
   * lock owners and one tab's reconnection is not a third.
   */
  clientSessionId?: string;
  /**
   * Response headers for this call, where the transport has any.
   *
   * Always absent today: this router is served over the WebSocket alone, and a
   * frame has no response headers at all — so a call the rate limiter refuses
   * carries its retry-after in the error data and nowhere else. The field stays
   * because `rate-limit/enforce.ts` takes one, and it is what stage 8 will hand
   * the value through when the protocol builder moves onto the rpc plane.
   */
  resHeaders?: Headers;
};

/**
 * The protocol builder's router, wired from the same dependencies the rpc plane
 * takes plus its own runtime.
 *
 * Every procedure on it is addressed by a protocol line, and #1257's rule
 * decides which lines a caller has — the router's own `openSession` resolves
 * that, because its inputs name a protocol and never a team or a draft.
 */
export function createRpcRouter(
  deps: RpcDeps & { protocolBuilder: ProtocolBuilderRuntime },
) {
  return {
    protocolBuilder: createProtocolBuilderRouter({
      auth: deps.auth,
      limiter: deps.limiter,
      runtime: deps.protocolBuilder,
      ...(deps.pool === undefined ? {} : { pool: deps.pool }),
      ...(deps.assetStore === undefined ? {} : { assetStore: deps.assetStore }),
      ...(deps.cipher === undefined ? {} : { cipher: deps.cipher }),
      ...(deps.services === undefined ? {} : { services: deps.services }),
    }),
  };
}
