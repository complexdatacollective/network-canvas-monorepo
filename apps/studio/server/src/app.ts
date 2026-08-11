import { upgradeWebSocket } from '@hono/node-server';
import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';

import { createApiV1 } from './api.ts';
import { createAssetRoutes, createAssetStore } from './assets.ts';
import { readEnv } from './env.ts';
import { rpcRouter } from './rpc.ts';

// The app WebSocket endpoint. In development the Vite dev server proxies this
// path (with `ws: true`) alongside /api and /rpc, so the browser sees one
// origin in both topologies — the single-origin invariant from #1245.
const WS_PATH = '/ws';

export function createApp(env = readEnv()) {
  const app = new Hono();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // The public data API — a separate surface from the SPA's RPC below, per
  // the 2026-08-11 decision on #1248.
  app.route('/api/v1', createApiV1());

  // Content-addressed asset bytes over plain HTTP (#1278) — /storage, not
  // /assets, which the client build claims for its hashed chunks.
  app.route('/storage', createAssetRoutes(env.s3 && createAssetStore(env.s3)));

  // The SPA's typed procedures (oRPC v2, decision recorded on #1244),
  // implementing the @codaco/studio-rpc boundary contract.
  const rpcHandler = new RPCHandler(rpcRouter);
  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: '/rpc',
    });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });

  // Unknown API and RPC paths must 404 as JSON (RFC 9457 problem shape, per
  // the API ADR #1248) — never fall through to the SPA fallback and return
  // HTML.
  app.all('/api/*', (c) =>
    c.json({ title: 'Not Found', status: 404 }, 404, {
      'Content-Type': 'application/problem+json',
    }),
  );
  app.all('/rpc/*', (c) =>
    c.json({ title: 'Not Found', status: 404 }, 404, {
      'Content-Type': 'application/problem+json',
    }),
  );

  // Placeholder handlers proving the WebSocket topology end to end; the real
  // protocol ("studio.sync.v1", #1247) replaces the echo behaviour, not the
  // wiring.
  app.get(
    WS_PATH,
    upgradeWebSocket(() => ({
      onMessage(event, ws) {
        ws.send(String(event.data));
      },
    })),
  );

  return app;
}
