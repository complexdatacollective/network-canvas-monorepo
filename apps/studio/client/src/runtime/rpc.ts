import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import { isTaggedError } from '@codaco/effect-query/errors';
import type { RpcAdapter } from '@codaco/effect-query/types';

import { reportUnauthorizedResponse } from '../lib/session.ts';
import { runtime, StudioClient, type StudioRpcsType } from './runtime.ts';

// The one place `StudioClient` is reached from, and therefore the one funnel
// every call a screen makes passes through.

/**
 * A procedure refusing with `Unauthorized` means the cached session is no
 * longer true. The client cannot decide what it became — only `/api/auth/*`
 * can tell signed-out from unreachable from no-database — so it reports the
 * refusal and the router re-asks (§6.2). The error still reaches the caller:
 * the adapter rethrows after this returns.
 *
 * This lives here, in the adapter's funnel, rather than at either of the two
 * seams that look right. `layerProtocolHttp`'s `transformClient` sits at the
 * HTTP layer, where every rpc response — failures included — is a 200, so it
 * never sees a refusal. `RpcMiddleware.layerClient` wraps only the *send* of a
 * request, while the response arrives out of band, so it never sees one either.
 * The funnel is the only seam that sees both, and it covers unary calls and
 * streams alike.
 *
 * Fire and forget: the report is what the router reacts to, and making every
 * failing call wait for a session re-ask would serialise the refusal behind it.
 */
const reportUnauthorizedFailure = (error: unknown): void => {
  if (isTaggedError(error, 'Unauthorized')) {
    void reportUnauthorizedResponse();
  }
};

/**
 * Annotated rather than inferred. `RpcClient.Flat` is a generic function type,
 * so TypeScript cannot recover the rpc union from a client value — left to
 * infer, `Rpcs` widens to `Rpc.Any`, every tag becomes `string` and every
 * payload becomes `never`, which is the whole typed surface gone. The
 * annotation is what makes an unknown tag a compile error (pinned by the
 * `@ts-expect-error` probes in the runtime suite).
 */
const adapter: RpcAdapter<StudioRpcsType> = makeRpcAdapter({
  runtime,
  client: StudioClient,
  onFailure: reportUnauthorizedFailure,
});

export const {
  rpcKey,
  rpcCall,
  rpcQuery,
  rpcInfiniteQuery,
  rpcMutation,
  useRpcStream,
} = adapter;
