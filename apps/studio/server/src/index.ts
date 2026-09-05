import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { createAssetStore } from './assets.ts';
import { flushDeniedAuditSummaries } from './audit/denial-rate-limit.ts';
import { createMailer } from './auth/email.ts';
import { mountClient } from './client-assets.ts';
import {
  createMaintenancePool,
  createPool,
  isMissingRoleError,
} from './db/pool.ts';
import {
  checkSchema,
  type SchemaProblem,
  type SchemaState,
} from './db/schema.ts';
import { readEnv } from './env.ts';
import { logOperational } from './observability/logger.ts';
import { observeWebSocketServer } from './observability/requests.ts';
import { createObservability } from './observability/runtime.ts';
import {
  type InvitationDeliveryWorker,
  startInvitationDeliveryWorker,
} from './team/invitation-delivery-dispatcher.ts';

// The executable owns process failure policy. Imported app modules never
// install process hooks, and a fatal error never continues serving requests.
function failProcess(): never {
  logOperational('STUDIO_PROCESS_FAILED');
  process.exit(1);
}
process.on('uncaughtException', failProcess);
process.on('unhandledRejection', failProcess);

// The server entry, development and production both: one Node process serving
// the public API, the internal RPC surface, /healthz, and the app WebSocket
// endpoint. Static client assets are served only where they exist — the
// self-host topology (#1245); the managed topology serves them from the CDN,
// and development serves them from the Vite dev server, which proxies API
// paths here so both topologies present a single origin.

const env = (() => {
  try {
    return readEnv();
  } catch {
    logOperational('STUDIO_CONFIGURATION_INVALID');
    return process.exit(1);
  }
})();
const pool = env.db ? createPool(env.db) : undefined;
const maintenancePool = env.db ? createMaintenancePool(env.db) : undefined;
const assetStore = env.s3 ? createAssetStore(env.s3) : undefined;
const observability = createObservability({
  pool,
  maintenancePool,
  assetStore,
  monitorProcess: true,
});
let invitationDeliveryWorker: InvitationDeliveryWorker | undefined;

function startDatabaseWorkers(): void {
  if (
    invitationDeliveryWorker ||
    !maintenancePool ||
    !env.auth ||
    env.auth.mailer.kind === 'refuse'
  ) {
    return;
  }
  invitationDeliveryWorker = startInvitationDeliveryWorker({
    pool: maintenancePool,
    observer: observability.metrics.observer,
    mailer: createMailer(env.auth.mailer),
    publicBaseUrl: env.auth.baseUrl,
  });
}

// Outside development a stale or absent schema is a resolved answer, not a
// transient failure: retrying re-reads the same fingerprint every three
// seconds. The development lane waits instead, the same way it waits for the
// container itself: `pnpm dev` finishes its reset before this process starts,
// but a server started on its own against a database another build applied,
// or a `db:reset` run beside a running server, should recover by themselves
// once the schema is current.
function exitIfFatal(state: SchemaState): void {
  if (state.kind !== 'current' && !env.devDefaults) {
    logOperational(
      state.kind === 'absent' ? 'STUDIO_SCHEMA_ABSENT' : 'STUDIO_SCHEMA_STALE',
    );
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
            startDatabaseWorkers();
            logOperational('STUDIO_SCHEMA_CURRENT');
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

  const waitForSchema = (state: SchemaProblem) => {
    exitIfFatal(state);
    logOperational(
      state.kind === 'absent' ? 'STUDIO_SCHEMA_ABSENT' : 'STUDIO_SCHEMA_STALE',
    );
    waitUntilCurrent();
  };

  try {
    const state = await checkSchema(pool);
    if (state.kind === 'current') {
      startDatabaseWorkers();
    } else {
      waitForSchema(state);
    }
  } catch (error) {
    // The pool runs as a role the schema apply creates, so a never-applied
    // database refuses the connection before the fingerprint can be read.
    if (isMissingRoleError(error)) {
      waitForSchema({ kind: 'absent' });
    } else {
      logOperational('STUDIO_DATABASE_UNREACHABLE');
      if (!env.devDefaults) process.exit(1);
      waitUntilCurrent();
    }
  }
}

const app = createApp(env, {
  assetStore,
  observability,
  invitationDeliveryAvailable: Boolean(
    env.auth && env.auth.mailer.kind !== 'refuse',
  ),
  pool,
});

mountClient(app, env);

const wsServer = new WebSocketServer({ noServer: true });
observeWebSocketServer(wsServer);

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
    hostname: env.host,
    websocket: { server: wsServer },
  },
  () => logOperational('STUDIO_SERVER_STARTED'),
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
  observability.stop();
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
      // resources. The outer ten-second backstop still caps total shutdown.
      void Promise.all([
        invitationDeliveryWorker?.stop(),
        flushDeniedAuditSummaries(),
      ])
        .catch(() => undefined)
        .then(() => Promise.all([pool?.end(), maintenancePool?.end()]))
        .catch(() => logOperational('STUDIO_SHUTDOWN_FAILED'))
        .finally(() => {
          process.exit(0);
        });
    });
    return undefined;
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
