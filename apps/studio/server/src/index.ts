import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

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
import { checkSchema, type SchemaState } from './db/schema.ts';
import {
  verifyClientAssetCache,
  type VerifiedClientAssetCache,
} from './deployment/client-asset-cache.ts';
import { readEncryptionEnv, readEnv } from './env.ts';
import { getSetupStatus } from './instance/bootstrap.ts';
import { logOperational } from './observability/logger.ts';
import { createOperationalApp } from './observability/operational-app.ts';
import { observeWebSocketServer } from './observability/requests.ts';
import { createObservability } from './observability/runtime.ts';
import { initializeEncryption } from './pii/initialize.ts';
import type { EncryptionKeys } from './pii/keys.ts';
import { acquireWebLease } from './runtime/web-lease.ts';
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
const servesWeb = env.role !== 'worker';
let retainedClientAssets: VerifiedClientAssetCache | undefined;
if (servesWeb && env.clientAssetCache) {
  try {
    retainedClientAssets = await verifyClientAssetCache(
      env.clientAssetCache,
      fileURLToPath(new URL('../client/assets', import.meta.url)),
    );
  } catch {
    logOperational('STUDIO_CLIENT_ASSETS_INVALID');
    process.exit(1);
  }
}
const pool = env.db && servesWeb ? createPool(env.db) : undefined;
const maintenancePool = env.db ? createMaintenancePool(env.db) : undefined;
const schemaPool = pool ?? maintenancePool;
const assetStore = env.s3 ? createAssetStore(env.s3) : undefined;
let invitationDeliveryWorker: InvitationDeliveryWorker | undefined;

function startDatabaseWorkers(): void {
  if (
    env.role === 'web' ||
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

// A configured database must be current before keys can be verified. Local
// development waits for its explicit reset, but does not start authentication,
// workers or the listener while the database or its keys are unavailable.
if (schemaPool) {
  for (;;) {
    try {
      const state = await checkSchema(schemaPool);
      if (state.kind === 'current') break;
      exitIfFatal(state);
      logOperational(
        state.kind === 'absent'
          ? 'STUDIO_SCHEMA_ABSENT'
          : 'STUDIO_SCHEMA_STALE',
      );
    } catch (error) {
      logOperational(
        isMissingRoleError(error)
          ? 'STUDIO_SCHEMA_ABSENT'
          : 'STUDIO_DATABASE_UNREACHABLE',
      );
      if (!env.devDefaults) process.exit(1);
    }
    await delay(3000);
  }
}

let encryptionKeys: EncryptionKeys | undefined;
if (maintenancePool) {
  try {
    encryptionKeys = await initializeEncryption({
      maintenancePool,
      ...readEncryptionEnv(env),
    });
  } catch {
    logOperational('STUDIO_ENCRYPTION_INVALID');
    process.exit(1);
  }
}

const webLease = pool
  ? await acquireWebLease(pool, () => {
      logOperational('STUDIO_WEB_LEASE_LOST');
      process.exit(1);
    }).catch(() => {
      logOperational('STUDIO_WEB_REPLICA_REFUSED');
      return process.exit(1);
    })
  : undefined;

const observability = createObservability({
  pool: schemaPool,
  maintenancePool,
  assetStore,
  monitorProcess: true,
});
startDatabaseWorkers();

const app = servesWeb
  ? createApp(env, {
      encryptionKeys,
      assetStore,
      observability,
      invitationDeliveryAvailable: Boolean(
        env.auth && env.auth.mailer.kind !== 'refuse',
      ),
      pool,
    })
  : createOperationalApp(env, observability);

if (servesWeb)
  mountClient(
    app,
    env,
    async () =>
      (await getSetupStatus(pool, env.bootstrapToken)).state === 'complete',
    retainedClientAssets,
  );

const wsServer = servesWeb
  ? new WebSocketServer({ noServer: true })
  : undefined;
if (wsServer) observeWebSocketServer(wsServer);

const server = serve(
  {
    fetch: app.fetch,
    port: env.port,
    hostname: env.host,
    ...(wsServer ? { websocket: { server: wsServer } } : {}),
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
  // Stop queue claims and accepting HTTP work immediately, before waiting
  // for active WebSocket close handshakes or an in-flight delivery attempt.
  const workerStopped = invitationDeliveryWorker?.stop();
  const httpClosed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  const closing = [...(wsServer?.clients ?? [])].map(
    (client) =>
      new Promise<void>((done) => {
        client.once('close', () => done());
        client.close(1001, 'Server shutting down');
      }),
  );
  wsServer?.close();
  void (async () => {
    let exitCode = 0;
    try {
      await Promise.all([httpClosed, workerStopped, ...closing]);
      // Requests may append suppression summaries until HTTP has drained.
      // Keep the application pool open until that final bounded flush ends.
      if (!(await flushDeniedAuditSummaries()))
        throw new Error('Audit summaries did not flush.');
    } catch {
      logOperational('STUDIO_SHUTDOWN_FAILED');
      exitCode = 1;
    } finally {
      webLease?.stop();
      const ended = await Promise.allSettled([
        pool?.end(),
        maintenancePool?.end(),
      ]);
      if (ended.some((result) => result.status === 'rejected')) {
        logOperational('STUDIO_SHUTDOWN_FAILED');
        exitCode = 1;
      }
      process.exit(exitCode);
    }
  })();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
