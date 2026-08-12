import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Context } from 'hono';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { runMigrations } from './db/migrate.ts';
import { createPool } from './db/pool.ts';
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

// Database migrations run at every boot (idempotent — applied ones are
// journaled; see src/db/migrate.ts). Single-instance deploys, so no
// cross-replica migration lock is needed yet. A configured production
// database that cannot be reached or migrated is a deployment mistake and
// fails the boot; in development the server comes up and auth surfaces
// fail until the dev Postgres is available.
//
// The migrations folder is resolved here, in the entry file: the production
// bundle collapses src/ into dist/index.js, so only this module's
// import.meta.url lands next to the image's drizzle/ directory (the same
// reasoning as clientRoot below).
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

if (pool) {
  const reportMigrationFailure = (error: unknown) => {
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.error(
      `Database migrations failed — sign-in will not work: ${String(error)}\n` +
        'If this database predates the migration system (or holds a stale pre-release schema), wipe the branch dev volume and restart:\n' +
        '  docker rm -f studio-dev-pg-<branch> && docker volume rm studio-dev-pg-<branch>',
    );
  };
  try {
    await runMigrations(pool, migrationsFolder);
  } catch (error) {
    if (env.production) throw error;
    const reachable = await pool.query('SELECT 1').then(
      () => true,
      () => false,
    );
    if (reachable) {
      // The database answered, so this is a real migration failure, not a
      // race against the dev-pg container — retrying would fail identically.
      reportMigrationFailure(error);
    } else {
      // oxlint-disable-next-line no-console -- boot diagnostics
      console.warn(
        `Database unreachable; sign-in will fail until it is available: ${String(error)}`,
      );
      // In dev the server may win the race against the dev-pg container
      // (image pull + initdb on a fresh volume); keep probing, and migrate
      // once when the database appears so sign-in starts working without a
      // manual restart.
      const retry = setInterval(() => {
        void pool.query('SELECT 1').then(
          () => {
            clearInterval(retry);
            runMigrations(pool, migrationsFolder)
              .then(() => {
                // oxlint-disable-next-line no-console -- boot diagnostics
                console.log('Database reachable; migrations applied.');
              })
              .catch(reportMigrationFailure);
          },
          () => undefined,
        );
      }, 3000);
      retry.unref();
    }
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
