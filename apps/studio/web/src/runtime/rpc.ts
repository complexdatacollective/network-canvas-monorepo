import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import { isTaggedError } from '@codaco/effect-query/errors';
import type { RpcAdapter } from '@codaco/effect-query/types';

import { reportUnauthorizedResponse } from '../lib/session.ts';
import { refusalOf } from './errors.ts';
import { runtime, StudioClient, type StudioRpcsType } from './runtime.ts';

/**
 * Reported from the adapter's funnel: `transformClient` sees every rpc response
 * as a 200, and `RpcMiddleware.layerClient` wraps only the send, so neither sees a refusal.
 */
export const reportUnauthorizedFailure = (error: unknown): void => {
  if (
    refusalOf(error)?.kind === 'unauthorized' ||
    isTaggedError(error, 'HostUnauthorized')
  ) {
    void reportUnauthorizedResponse();
  }
};

/**
 * Annotated: inferred, `Rpcs` widens to `Rpc.Any` and the typed surface is lost
 * (pinned by the `@ts-expect-error` probes in the runtime suite).
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
