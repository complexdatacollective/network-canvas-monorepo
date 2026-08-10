import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { openapi } from '@orpc/openapi';
// Smoke test: one router served simultaneously as REST (OpenAPIHandler, the
// public-API shape) and RPC (RPCHandler, the SPA shape), plus a type-safe
// client over the RPC link — all in-process via fetch adapters.
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { os, type RouterClient } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { z } from 'zod';

const StatusSchema = z.object({ name: z.string(), version: z.string() });

const status = os
  .meta(openapi({ method: 'GET', path: '/status' }))
  .output(StatusSchema)
  .handler(() => ({ name: 'Network Canvas Studio', version: '0.1.0' }));

const router = { status };

const restHandler = new OpenAPIHandler(router);
const rpcHandler = new RPCHandler(router);

// REST surface (what a researcher / generated Python client would hit)
const restRes = await restHandler.handle(
  new Request('http://localhost/api/v1/status'),
  { prefix: '/api/v1' },
);
console.log(
  'REST matched:',
  restRes.matched,
  '->',
  await restRes.response?.text(),
);

// RPC surface (what the SPA hits)
const rpcRes = await rpcHandler.handle(
  new Request('http://localhost/rpc/status', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }),
  { prefix: '/rpc' },
);
console.log(
  'RPC matched:',
  rpcRes.matched,
  '->',
  await rpcRes.response?.text(),
);

// Type-safe client over the RPC link, no codegen
const link = new RPCLink({
  url: 'http://localhost/rpc',
  fetch: async (url: string, init: RequestInit) => {
    const r = await rpcHandler.handle(new Request(url, init), {
      prefix: '/rpc',
    });
    if (!r.matched) throw new Error('unmatched');
    return r.response;
  },
});
const client: RouterClient<typeof router> = createORPCClient(link);
const result = await client.status();
console.log('typed client result:', result); // result: { name: string; version: string }
