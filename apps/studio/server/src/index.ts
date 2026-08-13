import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context } from 'hono';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { createPool } from './db/pool.ts';
import {
  ensureSchema,
  type SchemaState,
  staleSchemaMessage,
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

// A stale database is a resolved answer, not a transient failure: retrying it
// re-reads the same wrong fingerprint every three seconds. So it exits in both
// modes, while reachability keeps the existing production/development split.
function handleSchemaState(state: SchemaState): void {
  if (state.kind === 'stale') {
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.error(staleSchemaMessage(state));
    process.exit(1);
  }
  if (state.kind === 'created') {
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.log('Database schema applied.');
  }
}

// The schema is applied and fingerprinted at every boot — there is no
// migration system yet, deliberately (pre-release; see src/db/schema.ts).
// A configured production database that cannot be reached is a deployment
// mistake and fails the boot; in development the server comes up and auth
// surfaces fail until the dev Postgres is available.
if (pool) {
  try {
    handleSchemaState(await ensureSchema(pool));
  } catch (error) {
    if (env.production) throw error;
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.warn(
      `Database unreachable; sign-in will fail until it is available: ${String(error)}`,
    );
    // In dev the server may win the race against the dev-pg container
    // (image pull + initdb on a fresh volume); keep trying so sign-in
    // starts working without a manual restart. The listener is already up by
    // then, so a mismatch found here still takes the process down.
    //
    // One attempt at a time: an attempt against an unreachable host can
    // outlive its tick, and stacking them would exhaust the pool and let two
    // winners both report.
    let attempting = false;
    const retry = setInterval(() => {
      if (attempting) return;
      attempting = true;
      void ensureSchema(pool)
        .then((state) => {
          clearInterval(retry);
          // oxlint-disable-next-line no-console -- boot diagnostics
          console.log('Database reachable.');
          handleSchemaState(state);
          return undefined;
        })
        .catch(() => undefined)
        .finally(() => {
          attempting = false;
        });
    }, 3000);
    retry.unref();
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
