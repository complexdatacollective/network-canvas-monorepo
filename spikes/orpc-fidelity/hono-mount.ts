import { OpenAPIGenerator, openapi } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { os } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodToJsonSchemaConverter } from '@orpc/zod';
// Smoke test: mounting both oRPC surfaces inside a Hono app, mirroring the
// studio topology (Hono owns /healthz, SPA fallback, /ws; oRPC owns /api/v1
// REST and /rpc). The OpenAPI document is generated from the same router and
// served from within the versioned path, as the API ADR requires.
import { Hono } from 'hono';
import { z } from 'zod';

const StatusSchema = z
  .object({ name: z.string(), version: z.string() })
  .meta({ id: 'Status' });

const status = os
  .meta(openapi({ method: 'GET', path: '/status', summary: 'Instance status' }))
  .output(StatusSchema)
  .handler(() => ({ name: 'Network Canvas Studio', version: '0.1.0' }));

const router = { status };

const restHandler = new OpenAPIHandler(router);
const rpcHandler = new RPCHandler(router);
const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

const app = new Hono();

app.get('/healthz', (c) => c.json({ status: 'ok' }));

app.get('/api/v1/openapi.json', async (c) =>
  c.json(
    await generator.generate(router, {
      base: { info: { title: 'Network Canvas Studio API', version: 'v1' } },
    }),
  ),
);

app.use('/api/v1/*', async (c, next) => {
  const { matched, response } = await restHandler.handle(c.req.raw, {
    prefix: '/api/v1',
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

app.use('/rpc/*', async (c, next) => {
  const { matched, response } = await rpcHandler.handle(c.req.raw, {
    prefix: '/rpc',
  });
  if (matched) return c.newResponse(response.body, response);
  await next();
});

app.all('/api/*', (c) =>
  c.json({ title: 'Not Found', status: 404 }, 404, {
    'Content-Type': 'application/problem+json',
  }),
);

for (const [label, req] of [
  ['healthz          ', new Request('http://x/healthz')],
  ['REST status      ', new Request('http://x/api/v1/status')],
  ['openapi.json     ', new Request('http://x/api/v1/openapi.json')],
  [
    'RPC status       ',
    new Request('http://x/rpc/status', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  ],
  ['API 404 (problem)', new Request('http://x/api/v1/nope')],
] as const) {
  const res = await app.fetch(req);
  const body = await res.text();
  console.log(label, res.status, body.slice(0, 90));
}
