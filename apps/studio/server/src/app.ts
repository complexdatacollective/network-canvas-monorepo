import { randomUUID, timingSafeEqual } from 'node:crypto';

import { upgradeWebSocket } from '@hono/node-server';
import { COMMON_ERROR_STATUS_MAP, onError, ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { RPCHandler as WebSocketRPCHandler } from '@orpc/server/websocket';
import type { Context } from 'hono';
import type pg from 'pg';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';

import { createApiV1 } from './api.ts';
import {
  createAssetRoutes,
  createAssetStore,
  type AssetStore,
} from './assets.ts';
import { BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES } from './audit/better-auth-policy.ts';
import { createAuthService } from './auth/create.ts';
import { requireSameOrigin, requireWsOrigin } from './auth/csrf.ts';
import type { StudioMailer } from './auth/email.ts';
import {
  createPrincipalMiddleware,
  requirePrincipal,
} from './auth/principal.ts';
import type { AuthService } from './auth/service.ts';
import { createPool } from './db/pool.ts';
import { type AuthCapabilities, getDeploymentStatus } from './domain.ts';
import { readEnv } from './env.ts';
import {
  logOperational,
  type OperationalLogger,
} from './observability/logger.ts';
import { createOperationalApp } from './observability/operational-app.ts';
import { isProxyAddress } from './observability/proxy.ts';
import { createObservability } from './observability/runtime.ts';
import type { EncryptionKeys } from './pii/keys.ts';
import { createProtocolBuilderRuntime } from './protocol-builder/runtime.ts';
import { createRpcRouter } from './rpc.ts';
import type { ServerTelemetry } from './telemetry.ts';

// The app WebSocket endpoint. In development the Vite dev server proxies this
// path (with `ws: true`) alongside /api and /rpc, so the browser sees one
// origin in both topologies — the single-origin invariant from #1245.
const WS_PATH = '/ws';

// Hono matches `/storage/*` against the children of /storage but not the bare
// prefix, so anything covering the whole surface has to name both.
const STORAGE_PATHS = ['/storage', '/storage/*'];
const MANAGED_INGRESS_PROOF_HEADER = 'x-studio-managed-ingress-proof';
const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const BETTER_AUTH_ORGANIZATION_MUTATION_POLICIES: ReadonlyMap<
  string,
  { disposition: 'allowed' | 'blocked' }
> = new Map(
  Object.values(BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES)
    .filter(({ method }) => method === 'POST')
    .map((policy) => [policy.path, policy]),
);

type CreateAppDeps = {
  encryptionKeys?: EncryptionKeys;
  telemetry?: ServerTelemetry;
  mailer?: StudioMailer;
  auth?: AuthService;
  assetStore?: AssetStore;
  observability?: ReturnType<typeof createObservability>;
  logger?: OperationalLogger;
  /** A supported dispatcher is configured, locally or in a separate worker. */
  invitationDeliveryAvailable?: boolean;
  pool?: pg.Pool;
};

export function createApp(env = readEnv(), deps: CreateAppDeps = {}) {
  if (
    env.deploymentMode === 'managed' &&
    env.db &&
    (!env.managedIngressSecret ||
      env.trustedProxies.length === 0 ||
      env.trustedProxies.some((proxy) => !isProxyAddress(proxy)))
  ) {
    throw new Error(
      'Managed Studio HTTP with a database requires STUDIO_MANAGED_INGRESS_SECRET and TRUSTED_PROXIES',
    );
  }
  const pool = deps.pool ?? (env.db ? createPool(env.db) : undefined);
  const auth =
    deps.auth ??
    createAuthService(env, pool, {
      encryptionKeys: deps.encryptionKeys,
      mailer: deps.mailer,
    });
  const assetStore =
    deps.assetStore ?? (env.s3 ? createAssetStore(env.s3) : undefined);
  const observability =
    deps.observability ??
    createObservability({
      pool,
      assetStore,
      allowUnversionedSchema: env.devDefaults,
      allowedLogins: env.databaseAllowedLogins,
      administrativeLogins: env.databaseAdministrativeLogins,
    });
  const expectedProof = env.managedIngressSecret
    ? Buffer.from(env.managedIngressSecret)
    : undefined;
  const app = createOperationalApp(
    env,
    observability,
    deps.logger,
    (error) => deps.telemetry?.capture('server_request', error),
    expectedProof
      ? async (c, next) => {
          // Only exact liveness and independently authenticated metrics bypass
          // ingress proof. Install this gate before operational route handlers.
          if (c.req.path === '/healthz' || c.req.path === '/metrics')
            return next();
          const supplied = c.req.header(MANAGED_INGRESS_PROOF_HEADER);
          const receivedProof = supplied ? Buffer.from(supplied) : undefined;
          if (
            !receivedProof ||
            receivedProof.length !== expectedProof.length ||
            !timingSafeEqual(receivedProof, expectedProof)
          ) {
            return c.json({ title: 'Not Found', status: 404 }, 404, {
              'Cache-Control': 'no-store',
            });
          }
          await next();
        }
      : undefined,
  );
  const enabled = Boolean(env.db && env.auth);
  const authCaps: AuthCapabilities = {
    enabled,
    magicLink: Boolean(env.db && env.auth && env.auth.mailer.kind !== 'refuse'),
    // Unlike magicLink, not gated on the mailer: better-auth.ts enables
    // emailAndPassword unconditionally whenever auth itself is configured.
    emailAndPassword: enabled,
    socialProviders: enabled
      ? SOCIAL_PROVIDERS.filter(
          (provider) => env.auth?.socialProviders[provider],
        )
      : [],
  };

  // Which topology this deployment is. The client reads it from `status`;
  // src/client-assets.ts enforces the same classification at the HTTP layer.
  const deployment = getDeploymentStatus(env.deploymentMode);

  // Registered before the problem-JSON catch-alls below, which would
  // otherwise swallow the /api prefix.
  app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    // Studio owns these writes so their domain row and immutable audit event
    // share one transaction. Normalize trailing slashes here, at the one
    // Better Auth forwarding boundary, so no alternate URL can bypass it.
    const normalizedPath = c.req.path.replace(/\/+$/, '');
    if (
      c.req.method === 'POST' &&
      normalizedPath.startsWith('/api/auth/organization/')
    ) {
      const policy =
        BETTER_AUTH_ORGANIZATION_MUTATION_POLICIES.get(normalizedPath);
      if (!policy || policy.disposition === 'blocked') {
        return c.json({ title: 'Not Found', status: 404 }, 404, {
          'Content-Type': 'application/problem+json',
        });
      }
    }
    return await auth.handler(c.req.raw);
  });

  // The public data API — a separate surface from the SPA's RPC below, per
  // the 2026-08-11 decision on #1248.
  app.route('/api/v1', createApiV1(authCaps, deployment));

  // /storage, not /assets, which the client build claims for its hashed
  // chunks. Reading stays open: a session lookup per byte range would put the
  // database on the delivery path, and mounting the gate on the unsafe
  // methods alone is what keeps it off that path.
  if (env.auth) {
    app.on(UNSAFE_METHODS, STORAGE_PATHS, requireSameOrigin(env.auth.baseUrl));
  }
  app.on(
    UNSAFE_METHODS,
    STORAGE_PATHS,
    createPrincipalMiddleware(auth),
    requirePrincipal(),
  );
  app.route('/storage', createAssetRoutes(assetStore));

  // The SPA's typed procedures (oRPC v2, decision recorded on #1244),
  // implementing the @codaco/studio-rpc boundary contract.
  if (env.auth) {
    app.use('/rpc/*', requireSameOrigin(env.auth.baseUrl));
  }
  app.use('/rpc/*', createPrincipalMiddleware(auth));
  const rpcRouter = createRpcRouter(authCaps, {
    auth,
    deployment,
    bootstrapToken: env.bootstrapToken,
    telemetry: env.telemetry,
    invitationDeliveryAvailable: Boolean(
      deps.invitationDeliveryAvailable && authCaps.magicLink,
    ),
    pool,
    protocolBuilder: createProtocolBuilderRuntime(),
    assetStore,
  });
  const captureRpcError = (error: unknown) => {
    if (
      !(error instanceof ORPCError) ||
      !Object.hasOwn(COMMON_ERROR_STATUS_MAP, error.code) ||
      COMMON_ERROR_STATUS_MAP[
        error.code as keyof typeof COMMON_ERROR_STATUS_MAP
      ] >= 500
    )
      deps.telemetry?.capture('server_rpc', error);
  };
  const rpcHandler = new RPCHandler(rpcRouter, {
    interceptors: [onError(captureRpcError)],
  });
  // The same router over the socket: unary calls keep working on /rpc, and
  // the streaming procedure the fetch transport cannot serve — the protocol
  // builder's `watchProtocol` — is served here.
  const socketHandler = new WebSocketRPCHandler(rpcRouter, {
    interceptors: [onError(captureRpcError)],
  });
  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: '/rpc',
      context: { principal: c.get('principal'), requestId: c.get('requestId') },
    });
    if (matched) return c.newResponse(response.body, response);
    await next();
  });

  // Unknown machine-surface paths must 404 as JSON (RFC 9457 problem shape,
  // per the API ADR #1248) — never fall through to the SPA fallback, which
  // would answer an API, RPC, or asset request with 200 and the app shell's
  // HTML for a caller to cache.
  const notFound = (c: Context) =>
    c.json({ title: 'Not Found', status: 404 }, 404, {
      'Content-Type': 'application/problem+json',
    });
  for (const prefix of [
    '/api',
    '/rpc',
    '/storage',
    '/healthz',
    '/readyz',
    '/metrics',
  ]) {
    app.all(prefix, notFound);
    app.all(`${prefix}/*`, notFound);
  }

  // The same RPC surface over a socket, behind the same origin check,
  // principal, and metrics the echo placeholder proved.
  if (env.auth) {
    app.use(WS_PATH, requireWsOrigin(env.auth.baseUrl));
  }
  app.use(WS_PATH, createPrincipalMiddleware(auth));
  app.use(WS_PATH, requirePrincipal());
  app.get(
    WS_PATH,
    upgradeWebSocket(
      (c) => {
        const principal = c.get('principal');
        const requestId = c.get('requestId');
        // The socket is the lock owner and the presence identity, so it needs
        // an id of its own: two tabs of one researcher are two connections.
        const connectionId = randomUUID();
        return {
          onOpen() {
            observability.metrics.socketOpened();
          },
          onClose(_event, ws) {
            observability.metrics.socketClosed();
            void socketHandler.close(ws).catch(() => {
              logOperational('STUDIO_WEBSOCKET_ERROR');
            });
          },
          onError() {
            logOperational('STUDIO_WEBSOCKET_ERROR');
          },
          onMessage(event, ws) {
            const data: unknown = event.data;
            if (typeof data !== 'string' && !(data instanceof ArrayBuffer)) {
              logOperational('STUDIO_WEBSOCKET_ERROR');
              return;
            }
            // Handed over before any await: the adapter's ordering guarantee
            // is per message, in arrival order.
            void socketHandler
              .message(ws, data, {
                context: { principal, requestId, connectionId },
              })
              .catch(() => {
                logOperational('STUDIO_WEBSOCKET_ERROR');
              });
          },
        };
      },
      { onError: () => logOperational('STUDIO_WEBSOCKET_ERROR') },
    ),
  );

  return app;
}
