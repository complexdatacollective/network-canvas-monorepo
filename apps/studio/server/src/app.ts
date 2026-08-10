import { type HttpBindings, upgradeWebSocket } from '@hono/node-server';
import { RPCHandler } from '@orpc/server/fetch';
import { Hono } from 'hono';

import { createApiV1 } from './api.ts';
import { rpcRouter } from './rpc.ts';

// The app WebSocket endpoint. Deliberately distinct from Vite's HMR socket
// path (see server/src/dev.ts) so both can share one HTTP server in
// development — the dev/prod parity requirement from the framework ADR
// (#1245).
const WS_PATH = '/ws';

export function createApp() {
  const app = new Hono<{ Bindings: HttpBindings }>();

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  app.route('/api/v1', createApiV1());

  // The SPA's typed procedures (oRPC v2, decision recorded on #1244); the
  // public API surface above is unchanged pending #1248.
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
