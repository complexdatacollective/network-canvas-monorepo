import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';

import type { contract } from '@codaco/studio-rpc';

// Typed procedures over the server's /rpc surface (oRPC v2, #1244 decision).
// The contract import is type-only: RPCLink needs no runtime contract, and no
// server code enters the client's graph — the package diamond from #1244.

const link = new RPCLink({
  origin: window.location.origin,
  url: '/rpc',
});

const client: RouterContractClient<typeof contract> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
