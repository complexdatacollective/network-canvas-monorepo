import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { awaitCurrentSchema } from './boot.ts';
import { createPool } from './db/pool.ts';
import { readEnv } from './env.ts';
import { createJobClient, type JobClient } from './jobs/client.ts';
import { closeRateLimitStores } from './rate-limit/store.ts';
import { verifySecretKeysOrExit } from './secrets/boot.ts';
import { STUDIO_VERSION } from './version.ts';

// The web entry, development and production both: one Node process serving
// the public API, the internal RPC surface, /healthz and /readyz, and the app
// WebSocket endpoint. It serves no client assets at all (#1909): nginx does,
// from the studio-web image, and development serves them from the Vite dev
// server — which proxies these paths here, so every topology presents a single
// origin to the browser.
//
// It runs no background work at all (#1895): jobs are created here, inside the
// transaction that caused them, and executed by the worker process
// (src/worker.ts) started from the same image. Nothing here sends mail, and
// the mail variables are not even read — see readEnv's `withMail`.

const env = readEnv();
const { db } = env;
const pool = db ? createPool(db) : undefined;

// The enqueue-only pg-boss, on a small pool of its own pinned to the
// application role: every job is created by the role that may create one and
// can do nothing else with it. It exists from the moment there is a database
// to reach, and connects when the schema is current — pg-boss verifies its own
// installed version at start and never migrates (#1895).
//
// The development lane is why the two are separate. There the wait can outlast
// this boot, and a client that was only built once the schema arrived would
// leave every surface that enqueues without a queue for the life of the
// process. This one starts from `onCurrent` instead, and a start that failed
// is retried by the next enqueue rather than needing a restart.
const jobs: JobClient | undefined = db ? createJobClient(db) : undefined;

/**
 * Captured rather than awaited inside `onCurrent`, and awaited here: in a
 * deployment the schema is current at boot, so the secrets check settles
 * before the listener below binds and a refusal never reaches a request. In
 * the development lane `onCurrent` fires later, from the retry, and there is
 * nothing here to wait for.
 */
let checking: Promise<void> | undefined;

if (pool) {
  await awaitCurrentSchema(pool, env, {
    onCurrent: () => {
      // Beside the fingerprint check and for the same reason (#1900): a
      // keyring that cannot produce a key id already in the database would
      // serve every surface that touches no secret and fail the rest one
      // request at a time. It runs before the job client starts, because a
      // queue is the first thing that would act on one.
      checking = verifySecretKeysOrExit(env)
        .then(() => startJobs())
        .catch((error: unknown) => {
          // oxlint-disable-next-line no-console -- boot diagnostics
          console.error('Boot checks failed:', error);
          process.exit(1);
        });
    },
  });
}

await checking;

function startJobs(): void {
  void jobs?.start().catch((error: unknown) => {
    // Not fatal. A queue that cannot be reached fails the requests that
    // need it, with the reason, and the next one tries again; refusing the
    // boot would take down every surface that has nothing to do with
    // background work.
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.error('Could not start the job client:', error);
  });
}

const app = createApp(env, { jobs, pool });

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
      // Nothing of ours is ever in flight on the job client; stopping it ends
      // the pool it owns. The rate-limit store holds no state this process is
      // responsible for — its counters are in Valkey and the suppressed
      // windows are the worker's to summarise (#1909) — so closing it is
      // returning a socket, not flushing anything. The outer ten-second
      // backstop still caps total shutdown.
      void Promise.all([jobs?.stop(), closeRateLimitStores()])
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
