import { upgradeWebSocket } from '@hono/node-server';
import { RPCHandler } from '@orpc/server/fetch';
import { type Context, Hono } from 'hono';
import type pg from 'pg';

import { createApiV1 } from './api.ts';
import { createAssetRoutes, createAssetStore } from './assets.ts';
import { requireSameOrigin, requireWsOrigin } from './auth/csrf.ts';
import { type AuthService, createAuthService } from './auth/index.ts';
import {
  createPrincipalMiddleware,
  type PrincipalVariables,
  requirePrincipal,
} from './auth/principal.ts';
import type { AuthCapabilities } from './domain.ts';
import { readEnv } from './env.ts';
import { createRpcRouter } from './rpc.ts';

// The app WebSocket endpoint. In development the Vite dev server proxies this
// path (with `ws: true`) alongside /api and /rpc, so the browser sees one
// origin in both topologies — the single-origin invariant from #1245.
const WS_PATH = '/ws';

type CreateAppDeps = {
  /** Override the auth service — how tests inject fakes behind the seam. */
  auth?: AuthService;
  /** Share an existing pg pool (the entry point's) with the auth service. */
  pool?: pg.Pool;
};

export function createApp(env = readEnv(), deps: CreateAppDeps = {}) {
  const app = new Hono<PrincipalVariables>();

  // Unexpected failures on the machine surfaces (e.g. the database down
  // during a session lookup) must still leave as problem JSON, not Hono's
  // text/plain default.
  app.onError((error, c) => {
    // oxlint-disable-next-line no-console -- server-side failure diagnostics
    console.error(error);
    return c.json({ title: 'Internal Server Error', status: 500 }, 500, {
      'Content-Type': 'application/problem+json',
    });
  });
  const auth = deps.auth ?? createAuthService(env, deps.pool);
  const enabled = Boolean(env.db && env.auth);
  const authCaps: AuthCapabilities = {
    enabled,
    magicLink: Boolean(env.db && env.auth && env.auth.mailer.kind !== 'refuse'),
    socialProviders: enabled
      ? (['google', 'microsoft'] as const).filter(
          (provider) => env.auth?.socialProviders[provider],
        )
      : [],
  };

  app.get('/healthz', (c) => c.json({ status: 'ok' }));

  // Sign-in and session routes (#1255), served by the auth service behind
  // the src/auth seam. Registered before the problem-JSON catch-alls below,
  // which would otherwise swallow the /api prefix.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  // The public data API — a separate surface from the SPA's RPC below, per
  // the 2026-08-11 decision on #1248.
  app.route('/api/v1', createApiV1(authCaps));

  // Content-addressed asset bytes over plain HTTP (#1278) — /storage, not
  // /assets, which the client build claims for its hashed chunks.
  app.route('/storage', createAssetRoutes(env.s3 && createAssetStore(env.s3)));

  // The SPA's typed procedures (oRPC v2, decision recorded on #1244),
  // implementing the @codaco/studio-rpc boundary contract. The cookie plane
  // (#1248): explicit cross-origin refusal on unsafe methods, then principal
  // resolution into the oRPC context.
  if (env.auth) {
    app.use('/rpc/*', requireSameOrigin(env.auth.baseUrl));
  }
  app.use('/rpc/*', createPrincipalMiddleware(auth));
  const rpcHandler = new RPCHandler(createRpcRouter(authCaps));
  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: '/rpc',
      context: { principal: c.get('principal') },
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
  for (const prefix of ['/api', '/rpc', '/storage']) {
    app.all(prefix, notFound);
    app.all(`${prefix}/*`, notFound);
  }

  // Placeholder handlers proving the WebSocket topology end to end; the real
  // protocol ("studio.sync.v1", #1247) replaces the echo behaviour, not the
  // wiring. The upgrade is session-gated (#1248: cookie sessions cover /ws):
  // it is a GET, so requireSameOrigin cannot protect it and the Origin
  // header is checked directly.
  if (env.auth) {
    app.use(WS_PATH, requireWsOrigin(env.auth.baseUrl));
  }
  app.use(WS_PATH, createPrincipalMiddleware(auth));
  app.use(WS_PATH, requirePrincipal());
  app.get(
    WS_PATH,
    upgradeWebSocket(() => ({
      onMessage(event, ws) {
        ws.send(String(event.data));
      },
    })),
  );

  return app;
}
