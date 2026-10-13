import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import { isTaggedError } from '@codaco/effect-query/errors';
import type { RpcAdapter } from '@codaco/effect-query/types';

import { reportUnauthorizedResponse } from '../lib/session.ts';
import { logResearcher } from './browserLogs.ts';
import { faultCodeOf, refusalOf } from './errors.ts';
import { runtime, StudioClient, type StudioRpcsType } from './runtime.ts';

/**
 * Reported from the adapter's funnel: `transformClient` sees every rpc response
 * as a 200, and `RpcMiddleware.layerClient` wraps only the send, so neither sees a refusal.
 */
const reportUnauthorizedFailure = (error: unknown): void => {
  if (
    refusalOf(error)?.kind === 'unauthorized' ||
    isTaggedError(error, 'HostUnauthorized')
  ) {
    void reportUnauthorizedResponse();
  }
};

export const reportRpcFailure = (error: unknown): void => {
  reportUnauthorizedFailure(error);
  if (faultCodeOf(error) === 'transport') {
    logResearcher({
      message: 'Request to the server failed',
      level: 'Warn',
      attributes: { error_code: 'transport' },
    });
  }
};

/**
 * Annotated: inferred, `Rpcs` widens to `Rpc.Any` and the typed surface is lost
 * (pinned by the `@ts-expect-error` probes in the runtime suite).
 */
const adapter: RpcAdapter<StudioRpcsType> = makeRpcAdapter({
  runtime,
  client: StudioClient,
  onFailure: reportRpcFailure,
});

export const {
  rpcKey,
  rpcCall,
  rpcQuery,
  rpcInfiniteQuery,
  rpcMutation,
  useRpcStream,
} = adapter;
