import { createORPCClient, onError, ORPCError } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';

import type { contract } from '@codaco/studio-rpc';
import { CLIENT_SESSION_HEADER } from '@codaco/studio-rpc/client-session';

import { clientSessionId } from './clientSession.ts';
import { reportUnauthorizedResponse } from './session.ts';

// Typed procedures over the server's /rpc surface (oRPC v2, #1244 decision).
// The contract import is type-only: RPCLink needs no runtime contract, and no
// server code enters the client's graph — the package diamond from #1244.

const link = new RPCLink({
  origin: window.location.origin,
  url: '/rpc',
  // This tab, which is what its protocol-builder locks belong to. Named on
  // every call rather than on the lock procedures alone: the server reads the
  // owner out of the request, and a call that omitted it would be a stranger
  // to the section this tab is holding.
  headers: () => ({ [CLIENT_SESSION_HEADER]: clientSessionId() }),
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
