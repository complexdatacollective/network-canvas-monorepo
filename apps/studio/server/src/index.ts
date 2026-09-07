import { setTimeout as delay } from 'node:timers/promises';

import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';

import { assertSafePostgresRuntimeIdentity } from '@codaco/studio-sync/postgres-runtime-identity';
import { BACKUP_ROLE, TENANT_ROLES } from '@codaco/studio-sync/rls';

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
import { readEncryptionEnv, readEnv } from './env.ts';
import { installFatalErrorHandlers } from './fatal-errors.ts';
import { logOperational } from './observability/logger.ts';
import { observeWebSocketServer } from './observability/requests.ts';
import { createObservability } from './observability/runtime.ts';
import { initializeEncryption } from './pii/initialize.ts';
import type { EncryptionKeys } from './pii/keys.ts';
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
if (env.telemetry) {
  try {
    telemetry = await createServerTelemetry(true, {
      mode: env.deploymentMode,
      runtime: 'both',
      version: STUDIO_VERSION,
    });
  } catch {
    /* SDK availability cannot prevent Studio from starting. */
  }
}
const pool = env.db ? createPool(env.db) : undefined;
const maintenancePool = env.maintenanceDb
  ? createMaintenancePool(env.maintenanceDb)
  : undefined;
const assetStore = env.s3 ? createAssetStore(env.s3) : undefined;
let invitationDeliveryWorker: InvitationDeliveryWorker | undefined;

function startDatabaseWorkers(): void {
  if (
    invitationDeliveryWorker ||
    !maintenancePool ||
    !env.auth ||
    !mailer ||
    env.auth.mailer.kind === 'refuse'
  ) {
    return;
  }
  invitationDeliveryWorker = startInvitationDeliveryWorker({
    pool: maintenancePool,
    observer: observability.metrics.observer,
    reportError: (error) => telemetry?.capture('server_worker', error),
    mailer,
    publicBaseUrl: env.auth.baseUrl,
  });
}

async function admitDatabaseRuntime(): Promise<boolean> {
  if (!pool || !maintenancePool || env.devDefaults) return true;
  const runtimeRoleSets = [
    [TENANT_ROLES.app],
    [TENANT_ROLES.maintenance],
  ] as const;
  try {
    for (const [runtimePool, intendedRole] of [
      [pool, TENANT_ROLES.app],
      [maintenancePool, TENANT_ROLES.maintenance],
    ] as const) {
      const client = await runtimePool.connect();
      try {
        await assertSafePostgresRuntimeIdentity(client, {
          intendedRole,
          allowedRoles: [intendedRole],
          runtimeRoleSets,
          backupRole: BACKUP_ROLE,
          allowedLogins: env.databaseAllowedLogins ?? [],
          administrativeLogins: env.databaseAdministrativeLogins,
        });
      } finally {
        client.release();
      }
    }
    return true;
  } catch {
    logOperational('STUDIO_DATABASE_IDENTITY_UNSAFE');
    return process.exit(1);
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
if (pool) {
  for (;;) {
    try {
      const state = await checkSchema(pool, {
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

// Verify both actual serving logins before reading keys, constructing auth, or
// admitting workers and requests.
await admitDatabaseRuntime();

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

const observability = createObservability({
  pool,
  maintenancePool,
  assetStore,
  monitorProcess: true,
  allowUnversionedSchema: env.devDefaults,
  allowedLogins: env.databaseAllowedLogins,
  administrativeLogins: env.databaseAdministrativeLogins,
});
startDatabaseWorkers();

const app = createApp(env, {
  encryptionKeys,
  telemetry,
  mailer,
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

stopServing = () => {
  server.close();
  if ('closeAllConnections' in server) server.closeAllConnections();
  for (const socket of wsServer.clients) socket.terminate();
  void invitationDeliveryWorker?.stop();
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
  const workerStopped = invitationDeliveryWorker?.stop();
  mailer?.close();
  const httpClosed = new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  const closing = [...wsServer.clients].map(
    (client) =>
      new Promise<void>((done) => {
        client.once('close', () => done());
        client.close(1001, 'Server shutting down');
      }),
  );
  wsServer.close();
  void (async () => {
    let exitCode = 0;
    try {
      await Promise.all([httpClosed, workerStopped, ...closing]);
      if (!(await flushDeniedAuditSummaries()))
        throw new Error('Audit summaries did not flush.');
    } catch {
      logOperational('STUDIO_SHUTDOWN_FAILED');
      exitCode = 1;
    } finally {
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
