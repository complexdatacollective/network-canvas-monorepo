import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context } from 'hono';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { createPool } from './db/pool.ts';
import {
  checkSchema,
  type SchemaState,
  schemaProblemMessage,
} from './db/schema.ts';
import { readEnv } from './env.ts';
import { STUDIO_VERSION } from './version.ts';

// The server entry, development and production both: one Node process serving
// the public API, the internal RPC surface, /healthz, and the app WebSocket
// endpoint. Static client assets are served only where they exist — the
// self-host topology (#1245); the managed topology serves them from the CDN,
// and development serves them from the Vite dev server, which proxies API
// paths here so both topologies present a single origin.

const env = readEnv();
const pool = env.db ? createPool(env.db) : undefined;

// Stale everywhere and absent-in-production are resolved answers, not
// transient failures: retrying re-reads the same fingerprint every three
// seconds. The development lane waits for dev-pg's provision (or a manual
// db:reset) the same way it waits for the container itself.
function exitIfFatal(state: SchemaState): void {
  if (state.kind === 'stale' || (state.kind === 'absent' && !env.devDefaults)) {
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.error(schemaProblemMessage(state));
    process.exit(1);
  }
}

// A configured database that cannot be reached is a deployment mistake and
// fails the boot; only the development lane comes up anyway. Keyed on the
// development marker rather than `NODE_ENV`, so a deployment that forgot
// `NODE_ENV=production` does not inherit the retry and boot green with no
// database.
if (pool) {
  // One attempt at a time: an attempt against an unreachable host can
  // outlive its tick, and stacking them would exhaust the pool. A mismatch
  // found mid-retry still takes the process down.
  const waitUntilCurrent = () => {
    let attempting = false;
    const retry = setInterval(() => {
      if (attempting) return;
      attempting = true;
      void checkSchema(pool)
        .then((state) => {
          exitIfFatal(state);
          if (state.kind === 'current') {
            clearInterval(retry);
            // oxlint-disable-next-line no-console -- boot diagnostics
            console.log('Database schema current.');
          }
          return undefined;
        })
        .catch(() => undefined)
        .finally(() => {
          attempting = false;
        });
    }, 3000);
    retry.unref();
  };

  try {
    const state = await checkSchema(pool);
    exitIfFatal(state);
    if (state.kind === 'absent') {
      // oxlint-disable-next-line no-console -- boot diagnostics
      console.warn(
        'Database has no Studio schema; sign-in will fail until it is created: pnpm --filter @codaco/studio-server db:reset',
      );
      waitUntilCurrent();
    }
  } catch (error) {
    if (!env.devDefaults) throw error;
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.warn(
      `Database unreachable; sign-in will fail until it is available: ${String(error)}`,
    );
    waitUntilCurrent();
  }
}

const app = createApp(env, { pool });

// Default matches the Docker image layout: dist/index.js next to a client/
// directory. `pnpm start` overrides via CLIENT_DIST for the local layout.
const clientRoot = env.clientDist
  ? resolve(process.cwd(), env.clientDist)
  : fileURLToPath(new URL('../client', import.meta.url));

// Hashed build assets are immutable by construction; the app shell must
// revalidate every load so deploys take effect (and open tabs keep resolving
// old hashed chunks from the CDN, not from here).
function setCacheHeader(path: string, c: Context) {
  c.header(
    'Cache-Control',
    path.endsWith('index.html')
      ? 'no-store'
      : path.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600',
  );
}

app.use('*', serveStatic({ root: clientRoot, onFound: setCacheHeader }));
// SPA fallback: unmatched GET paths serve the app shell so client-side routes
// deep-link correctly.
app.get(
  '*',
  serveStatic({
    root: clientRoot,
    path: 'index.html',
    onFound: setCacheHeader,
  }),
);

const wsServer = new WebSocketServer({ noServer: true });

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
    hostname: env.host,
    websocket: { server: wsServer },
  },
  (info) => {
    // oxlint-disable-next-line no-console -- boot log
    console.log(
      `Network Canvas Studio ${STUDIO_VERSION} listening on http://${info.address}:${info.port}`,
    );
  },
);

// Graceful shutdown is a requirement, not a nicety (#1247): every backend
// deploy drops live sync sessions, so connections are told to go away (1001)
// and their close handshakes are awaited before the listener drains and the
// process exits — the HTTP server does not track upgraded sockets, so
// exiting on server.close alone could cut close frames off mid-flight. The
// timer is the backstop for connections that never complete the handshake.
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  setTimeout(() => process.exit(1), 10_000).unref();
  const closing = [...wsServer.clients].map(
    (client) =>
      new Promise<void>((done) => {
        client.once('close', () => done());
        client.close(1001, 'Server shutting down');
      }),
  );
  void Promise.all(closing).then(() => {
    server.close(() => {
      void Promise.resolve(pool?.end())
        .catch(() => undefined)
        .then(() => process.exit(0));
    });
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
