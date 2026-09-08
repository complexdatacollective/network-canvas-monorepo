import { createORPCClient, onError, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';

import type { contract } from '@codaco/studio-rpc';

import { reportUnauthorizedResponse } from './session.ts';

// Typed procedures over the server's /rpc surface (oRPC v2, #1244 decision).
// The contract import is type-only: RPCLink needs no runtime contract, and no
// server code enters the client's graph — the package diamond from #1244.

const link = new RPCLink({
  origin: window.location.origin,
  url: '/rpc',
});

export const rpcClient: RouterContractClient<typeof contract> =
  createORPCClient(link, {
    interceptors: [
      // A procedure refusing with 401 means the cached session is no longer
      // true. The client cannot decide what it became — only /api/auth/* can
      // tell signed-out from unreachable from no-database — so it reports the
      // refusal and the router re-asks (§6.2). The error still reaches the
      // caller: `onError` rethrows.
      onError(async (error) => {
        if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') {
          await reportUnauthorizedResponse();
        }
      }),
    ],
  });

export const orpc = createTanstackQueryUtils(rpcClient);
