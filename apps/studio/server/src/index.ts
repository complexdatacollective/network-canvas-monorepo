import { setTimeout as delay } from 'node:timers/promises';

import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { createApp } from './app.ts';
import { createAssetStore } from './assets.ts';
import {
  startAuditAlertWorker,
  type AuditAlertWorker,
} from './audit/alert-delivery.ts';
import { flushDeniedAuditSummaries } from './audit/denial-rate-limit.ts';
import { createMailer } from './auth/email.ts';
import { mountClient } from './client-assets.ts';
import {
  createMaintenancePool,
  createPool,
  isMissingRoleError,
} from './db/pool.ts';
import { checkSchema, type SchemaState } from './db/schema.ts';
import { readEncryptionEnv, readEnv } from './env.ts';
import { installFatalErrorHandlers } from './fatal-errors.ts';
import { getSetupStatus } from './instance/bootstrap.ts';
import { logOperational } from './observability/logger.ts';
import { createOperationalApp } from './observability/operational-app.ts';
import { observeWebSocketServer } from './observability/requests.ts';
import { createObservability } from './observability/runtime.ts';
import type { EncryptionKeys } from './pii/keys.ts';
import {
  DatabaseRuntimeAdmissionError,
  initializeServingEncryption,
} from './pii/serving-admission.ts';
import { acquireWebLease } from './runtime/web-lease.ts';
import {
  type InvitationDeliveryWorker,
  startInvitationDeliveryWorker,
} from './team/invitation-delivery-dispatcher.ts';
import { createServerTelemetry, type ServerTelemetry } from './telemetry.ts';
import { STUDIO_VERSION } from './version.ts';

// Process policy is installed before configuration or SDK loading can fail.
let telemetry: ServerTelemetry | undefined;
let stopServing = () => {};
installFatalErrorHandlers({
  telemetry: () => telemetry,
  stopServing: () => stopServing(),
});

// The server entry, development and production both: one Node process serving
// the public API, the internal RPC surface, /healthz, and the app WebSocket
// endpoint. Static client assets are served only where they exist — the
// self-host topology (#1245); the managed topology serves them from the CDN,
// and development serves them from the Vite dev server, which proxies API
// paths here so both topologies present a single origin.

const { env, mailer } = (() => {
  try {
    const resolvedEnv = readEnv();
    if (
      resolvedEnv.db &&
      !resolvedEnv.devDefaults &&
      !resolvedEnv.maintenanceDb
    ) {
      throw new Error('Missing maintenance database configuration.');
    }
    // One owned transport serves authentication and the invitation worker.
    // Validate it before database work or request admission.
    return {
      env: resolvedEnv,
      mailer: resolvedEnv.auth
        ? createMailer(resolvedEnv.auth.mailer)
        : undefined,
    };
  } catch {
    logOperational('STUDIO_CONFIGURATION_INVALID');
    return process.exit(1);
  }
})();
const servesWeb = env.role !== 'worker';
if (env.telemetry) {
  try {
    telemetry = await createServerTelemetry(true, {
      mode: env.deploymentMode,
      runtime: env.role,
      version: STUDIO_VERSION,
    });
  } catch {
    /* SDK availability cannot prevent Studio from starting. */
  }
}
const pool = env.db && servesWeb ? createPool(env.db) : undefined;
const maintenancePool = env.maintenanceDb
  ? createMaintenancePool(env.maintenanceDb)
  : undefined;
const schemaPool = pool ?? maintenancePool;
const assetStore = env.s3 ? createAssetStore(env.s3) : undefined;
let invitationDeliveryWorker: InvitationDeliveryWorker | undefined;
let auditAlertWorker: AuditAlertWorker | undefined;

function startDatabaseWorkers(): void {
  if (env.role === 'web' || !maintenancePool || !env.auth) return;
  const emailMailer = env.auth.mailer.kind === 'refuse' ? undefined : mailer;
  auditAlertWorker ??= startAuditAlertWorker({
    pool: maintenancePool,
    observer: observability.metrics.observer,
    reportError: (error) => telemetry?.capture('server_worker', error),
    mailer: emailMailer,
    publicBaseUrl: env.auth.baseUrl,
  });
  if (!invitationDeliveryWorker && emailMailer) {
    invitationDeliveryWorker = startInvitationDeliveryWorker({
      pool: maintenancePool,
      observer: observability.metrics.observer,
      reportError: (error) => telemetry?.capture('server_worker', error),
      mailer: emailMailer,
      publicBaseUrl: env.auth.baseUrl,
    });
  }
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
      const state = await checkSchema(schemaPool, {
        allowUnversioned: env.devDefaults,
        allowedLogins: env.databaseAllowedLogins,
        administrativeLogins: env.databaseAdministrativeLogins,
      });
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
    encryptionKeys = await initializeServingEncryption({
      pool,
      maintenancePool,
      allowUnversioned: env.devDefaults,
      allowedLogins: env.databaseAllowedLogins,
      administrativeLogins: env.databaseAdministrativeLogins,
      ...readEncryptionEnv(env),
    });
  } catch (error) {
    logOperational(
      error instanceof DatabaseRuntimeAdmissionError
        ? 'STUDIO_DATABASE_IDENTITY_UNSAFE'
        : 'STUDIO_ENCRYPTION_INVALID',
    );
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
  encryptionKeys,
  pool,
  maintenancePool,
  assetStore,
  monitorProcess: true,
  allowUnversionedSchema: env.devDefaults,
  allowedLogins: env.databaseAllowedLogins,
  administrativeLogins: env.databaseAdministrativeLogins,
});
startDatabaseWorkers();

const app = servesWeb
  ? createApp(env, {
      mailer,
      encryptionKeys,
      telemetry,
      assetStore,
      observability,
      invitationDeliveryAvailable: Boolean(
        env.auth && env.auth.mailer.kind !== 'refuse',
      ),
      pool,
    })
  : createOperationalApp(env, observability, undefined, (error) =>
      telemetry?.capture('server_request', error),
    );

if (servesWeb)
  mountClient(
    app,
    env,
    async () =>
      (await getSetupStatus(pool, env.bootstrapToken)).state === 'complete',
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

stopServing = () => {
  server.close();
  if ('closeAllConnections' in server) server.closeAllConnections();
  for (const socket of wsServer?.clients ?? []) socket.terminate();
  void invitationDeliveryWorker?.stop();
  void auditAlertWorker?.stop();
  mailer?.close();
  observability.stop();
};

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
  const workersStopped = Promise.all([
    invitationDeliveryWorker?.stop(),
    auditAlertWorker?.stop(),
  ]);
  mailer?.close();
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
      await Promise.all([httpClosed, workersStopped, ...closing]);
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
        telemetry?.close(),
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
