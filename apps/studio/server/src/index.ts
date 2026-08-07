import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { readEnv } from './env.ts';
import { STUDIO_VERSION } from './version.ts';

// Production entry: one Node process serving the built SPA, the public API,
// /healthz, and the app WebSocket endpoint — the single-artifact topology from
// the framework ADR (#1245). Development uses server/src/dev.ts instead, which
// serves the same app with Vite mounted in middleware mode.

const env = readEnv();
const app = createApp();

// This entry runs from dist/server/, so the built client sits at ../client.
const clientRoot = fileURLToPath(new URL('../client', import.meta.url));

app.use('*', serveStatic({ root: clientRoot }));
// SPA fallback: unmatched GET paths serve the app shell so client-side routes
// deep-link correctly.
app.get('*', serveStatic({ root: clientRoot, path: 'index.html' }));

serve(
  {
    fetch: app.fetch,
    port: env.port,
    hostname: env.host,
    websocket: { server: new WebSocketServer({ noServer: true }) },
  },
  (info) => {
    // oxlint-disable-next-line no-console -- boot log
    console.log(
      `Network Canvas Studio ${STUDIO_VERSION} listening on http://${info.address}:${info.port}`,
    );
  },
);
