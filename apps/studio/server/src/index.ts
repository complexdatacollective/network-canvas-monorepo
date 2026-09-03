import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
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
  schemaProblemMessage,
} from './db/schema.ts';
import { readEnv } from './env.ts';
import {
  type InvitationDeliveryWorker,
  startInvitationDeliveryWorker,
} from './team/invitation-delivery-dispatcher.ts';
import { STUDIO_VERSION } from './version.ts';

// The server entry, development and production both: one Node process serving
// the public API, the internal RPC surface, /healthz, and the app WebSocket
// endpoint. Static client assets are served only where they exist — the
// self-host topology (#1245); the managed topology serves them from the CDN,
// and development serves them from the Vite dev server, which proxies API
// paths here so both topologies present a single origin.

const env = readEnv();
const pool = env.db ? createPool(env.db) : undefined;
const maintenancePool = env.db ? createMaintenancePool(env.db) : undefined;
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
    mailer: createMailer(env.auth.mailer),
    publicBaseUrl: env.auth.baseUrl,
  });
}

// Outside development a stale or absent schema is a resolved answer, not a
// transient failure: retrying re-reads the same fingerprint every three
// seconds. The development lane waits instead, the same way it waits for the
// container itself: dev-pg drops and reseeds the database on every boot, so
// the schema this process finds first may be last build's, or none at all,
// for a few seconds.
function exitIfFatal(state: SchemaState): void {
  if (state.kind !== 'current' && !env.devDefaults) {
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
            startDatabaseWorkers();
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

  const waitForSchema = (state: SchemaProblem) => {
    exitIfFatal(state);
    // oxlint-disable-next-line no-console -- boot diagnostics
    console.warn(
      state.kind === 'absent'
        ? 'Database has no Studio schema; sign-in will fail until it is created: pnpm --filter @codaco/studio-server db:reset'
        : 'Database schema is not from this build; waiting for the development reset (pnpm dev runs it on boot; otherwise: pnpm --filter @codaco/studio-server db:reset)',
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
      if (!env.devDefaults) throw error;
      // oxlint-disable-next-line no-console -- boot diagnostics
      console.warn(
        `Database unreachable; sign-in will fail until it is available: ${String(error)}`,
      );
      waitUntilCurrent();
    }
  }
}

const app = createApp(env, {
  invitationDeliveryAvailable: Boolean(
    env.auth && env.auth.mailer.kind !== 'refuse',
  ),
  pool,
});

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
      // resources. The outer ten-second backstop still caps total shutdown.
      void Promise.all([
        invitationDeliveryWorker?.stop(),
        flushDeniedAuditSummaries(),
      ])
        .catch(() => undefined)
        .then(() => Promise.all([pool?.end(), maintenancePool?.end()]))
        .finally(() => {
          process.exit(0);
        });
    });
    return undefined;
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
