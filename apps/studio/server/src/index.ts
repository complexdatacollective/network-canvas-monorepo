import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { flushDeniedAuditSummaries } from './audit/denial-rate-limit.ts';
import { awaitCurrentSchema } from './boot.ts';
import { mountClient } from './client-assets.ts';
import { createPool } from './db/pool.ts';
import { readEnv } from './env.ts';
import { createJobClient, type JobClient } from './jobs/client.ts';
import { STUDIO_VERSION } from './version.ts';

// The web entry, development and production both: one Node process serving
// the public API, the internal RPC surface, /healthz, and the app WebSocket
// endpoint. Static client assets are served only where they exist — the
// self-host topology (#1245); the managed topology serves them from the CDN,
// and development serves them from the Vite dev server, which proxies API
// paths here so both topologies present a single origin.
//
// It runs no background work at all (#1895): jobs are created here, inside the
// transaction that caused them, and executed by the worker process
// (src/worker.ts) started from the same image. Nothing here sends mail, and
// the mail variables are not even read — see readEnv's `withMail`.

const env = readEnv();
const pool = env.db ? createPool(env.db) : undefined;

// The enqueue-only pg-boss, on the application pool: every job is created by
// the role that may create one and can do nothing else with it. Started only
// once the schema is current, because pg-boss verifies its own installed
// version at start and never migrates (#1895).
//
// On the development lane the wait can outlast this boot, and then there is no
// client to hand over: that is the lane whose warning already says sign-in
// will fail until the schema is created, and `pnpm dev` applies it before this
// process starts.
let jobs: JobClient | undefined;
if (pool) {
  let starting: Promise<JobClient> | undefined;
  await awaitCurrentSchema(pool, env, {
    onCurrent: () => {
      starting = createJobClient(pool);
    },
  });
  try {
    jobs = await starting;
  } catch (error) {
    // Not fatal. A queue that cannot be reached fails the requests that need
    // it, with the reason; refusing the boot would take down every surface
    // that has nothing to do with background work.
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.error('Could not start the job client:', error);
  }
}

const app = createApp(env, { jobs, pool });

mountClient(app, env);

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
      // Suppression summaries use the application pool, so give their
      // bounded flush a chance to become immutable before closing database
      // resources. Nothing of ours is ever in flight on the job client, so
      // stopping it only has to happen before the pool it borrows ends. The
      // outer ten-second backstop still caps total shutdown.
      void Promise.all([jobs?.stop(), flushDeniedAuditSummaries()])
        .catch(() => undefined)
        .then(() => pool?.end())
        .finally(() => {
          process.exit(0);
        });
    });
    return undefined;
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
