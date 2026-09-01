import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterContractClient } from '@orpc/contract';

import type { contract } from '@codaco/studio-rpc';

import type { createApp } from '../../app.ts';

// The contract-typed client the SPA uses, bridged straight into the Hono app.
// oRPC calls are POSTs, so the cookie plane's CSRF check (#1248) applies:
// the client asserts same-origin the way a browser would.
export function createRpcClient(
  app: ReturnType<typeof createApp>,
  headers: Record<string, string> = {},
) {
  const link = new RPCLink({
    origin: 'http://studio.test',
    url: '/rpc',
    headers: { 'sec-fetch-site': 'same-origin', ...headers },
    fetch: async (url, init) => app.request(url, init),
  });
  return createORPCClient(link) as RouterContractClient<typeof contract>;
}
