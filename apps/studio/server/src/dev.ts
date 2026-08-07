import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';

import { createAdaptorServer } from '@hono/node-server';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { createServer as createViteServer } from 'vite';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { readEnv } from './env.ts';

// Development entry: the same Hono server as production, with the Vite dev
// server mounted in middleware mode so the SPA (including HMR) is served
// through the Hono process on one port. Vite's HMR socket lives on its own
// path; the app WebSocket endpoint (server/src/app.ts) is untouched — both
// attach polite `upgrade` listeners to the same HTTP server and ignore
// requests that are not addressed to them.
const HMR_PATH = '/__vite_hmr';

const env = readEnv();
const app = createApp();

const server = createAdaptorServer({
  fetch: app.fetch,
  websocket: { server: new WebSocketServer({ noServer: true }) },
});

const vite = await createViteServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  appType: 'spa',
  server: {
    middlewareMode: true,
    hmr: { server: server as Server, path: HMR_PATH },
  },
});

// Catch-all bridge into Vite's connect middleware. Server-owned routes are
// registered first in createApp, so they win; anything reaching this
// middleware is a client asset or SPA navigation. Vite handles the response
// on the raw Node objects (including the index.html fallback), so Hono is
// told not to write one.
app.all('*', (c) => {
  const { incoming, outgoing } = c.env;
  // WebSocket upgrade dispatches carry no response object — @hono/node-server
  // runs every upgrade through the app to find a matching WS route. Upgrades
  // for paths the server does not own (Vite's HMR socket) must be declined
  // here so Vite's own upgrade listener handles them.
  if ((outgoing as typeof outgoing | undefined) === undefined) {
    return c.notFound();
  }
  vite.middlewares(incoming, outgoing, () => {
    outgoing.statusCode = 404;
    outgoing.end('Not found');
  });
  return RESPONSE_ALREADY_SENT;
});

server.listen(env.port, env.host, () => {
  // oxlint-disable-next-line no-console -- boot log
  console.log(`Studio dev server listening on http://localhost:${env.port}`);
});
