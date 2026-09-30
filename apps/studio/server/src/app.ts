import { randomUUID } from 'node:crypto';

import { upgradeWebSocket } from '@hono/node-server';
import { RPCHandler } from '@orpc/server/fetch';
import { ResponseHeadersPlugin } from '@orpc/server/plugins';
import { RPCHandler as WebSocketRPCHandler } from '@orpc/server/websocket';
import { type Context, Hono } from 'hono';
import type pg from 'pg';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';
import {
  CLIENT_SESSION_HEADER,
  CLIENT_SESSION_PARAM,
  readClientSessionId,
} from '@codaco/studio-rpc/client-session';

import { createApiV1 } from './api.ts';
import { createAssetRoutes, createAssetStore } from './assets.ts';
import { BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES } from './audit/better-auth-policy.ts';
import { createAuthService } from './auth/create.ts';
import { requireSameOrigin, requireWsOrigin } from './auth/csrf.ts';
import {
  createPrincipalMiddleware,
  type PrincipalVariables,
  requirePrincipal,
} from './auth/principal.ts';
import type { AuthService } from './auth/service.ts';
import { clientAddress, createTrustedProxies } from './client-address.ts';
import { createPool } from './db/pool.ts';
import {
  type AuthCapabilities,
  getDeploymentStatus,
  type InstallationReader,
} from './domain.ts';
import { readEnv } from './env.ts';
import {
  CHECK_TIMEOUT_MS,
  createHealthRoutes,
  databaseCheck,
  schemaCheck,
} from './health.ts';
import type { JobClient } from './jobs/client.ts';
import { createProtocolBuilderRuntime } from './protocol-builder/runtime.ts';
import { createRateLimiter } from './rate-limit.ts';
import type { RateLimitSettings } from './rate-limit/scopes.ts';
import { createRpcRouter } from './rpc.ts';
import { createSecretsCipher } from './secrets/cipher.ts';
import { readInstallation } from './setup/bootstrap.ts';

// The app WebSocket endpoint. In development the Vite dev server proxies this
// path (with `ws: true`) alongside /api and /rpc, so the browser sees one
// origin in both topologies — the single-origin invariant from #1245.
const WS_PATH = '/ws';

// Hono matches `/storage/*` against the children of /storage but not the bare
// prefix, so anything covering the whole surface has to name both.
const STORAGE_PATHS = ['/storage', '/storage/*'];
const UNSAFE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Hono matches a bare prefix and its children separately, the same way
// STORAGE_PATHS does; the public API needs both for the same reason.
const API_V1_PATHS = ['/api/v1', '/api/v1/*'];

/**
 * The two sign-in endpoints that name the account being signed in to. The
 * per-address limit is better-auth's own (src/auth/better-auth.ts); this is
 * the other half of the pair — an attacker spreading attempts across a botnet
 * meets a per-address limit once per host, and a per-email limit every time.
 *
 * `/sign-in/social` is absent deliberately: the request names a provider, not
 * an account, and the identity is not known until the provider answers.
 */
const SIGN_IN_EMAIL_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-in/magic-link',
]);

/** What every refused request answers, in the shape the rest of the API uses. */
function tooManyRequests(c: Context, retryAfterSeconds: number) {
  return c.json({ title: 'Too Many Requests', status: 429 }, 429, {
    'Content-Type': 'application/problem+json',
    'Retry-After': String(retryAfterSeconds),
  });
}

/**
 * One string field out of a JSON body, read from a clone so the request itself
 * is still unread when it reaches the handler behind this. A body that is not
 * JSON, or that names nothing, is not limited here: better-auth is about to
 * refuse it, and inventing a bucket for an unparseable body would let a
 * malformed request spend a real caller's allowance.
 */
async function readBodyField(
  c: Context,
  field: string,
): Promise<string | null> {
  try {
    const body: unknown = await c.req.raw.clone().json();
    if (typeof body !== 'object' || body === null) return null;
    const value = (body as Record<string, unknown>)[field];
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

/**
 * The email a sign-in POST is limited under, or none.
 *
 * Invitation acceptance is not here. better-auth's
 * `/organization/accept-invitation` is blocked outright
 * (audit/better-auth-policy.ts) so that acceptance and its audit event share
 * one transaction, which means a limit on that path would guard a route that
 * only ever answers 404. It lives on `team.acceptInvitation` instead, which is
 * the path the client takes (src/rpc.ts).
 */
async function signInEmailSubject(
  c: Context,
  path: string,
): Promise<string | null> {
  if (!SIGN_IN_EMAIL_PATHS.has(path)) return null;
  const email = await readBodyField(c, 'email');
  // Lower-cased so one account is one bucket: the local part is formally
  // case-sensitive, but no identity provider Studio speaks to treats it that
  // way, and two buckets would double the limit.
  return email ? email.toLowerCase() : null;
}

const BETTER_AUTH_ORGANIZATION_MUTATION_POLICIES: ReadonlyMap<
  string,
  { disposition: 'allowed' | 'blocked' }
> = new Map(
  Object.values(BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES)
    .filter(({ method }) => method === 'POST')
    .map((policy) => [policy.path, policy]),
);

type CreateAppDeps = {
  auth?: AuthService;
  /**
   * How a request creates background work (#1895). Absent where there is no
   * database: nothing can be queued, and nothing that would queue anything is
   * reachable, because auth is off.
   */
  jobs?: JobClient;
  pool?: pg.Pool;
  /**
   * Scopes this app enforces something other than their constant for. A
   * deployment never passes it — the limits are the constants in
   * `rate-limit/scopes.ts` and there is no way to configure them — and the
   * suites do, because tripping a real limit through the request path would
   * otherwise mean two thousand requests to `/storage`.
   */
  limits?: Partial<RateLimitSettings>;
};

export function createApp(env = readEnv(), deps: CreateAppDeps = {}) {
  const app = new Hono<PrincipalVariables>();

  // Every limit this process enforces, counted in the shared store (#1909).
  // Built before anything is mounted because better-auth's own sign-in limiter
  // stores its counters through it too.
  const limiter = createRateLimiter(env, deps.limits);
  const trustedProxies = createTrustedProxies(env.trustedProxies);

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
  const pool = deps.pool ?? (env.db ? createPool(env.db) : undefined);
  const auth = deps.auth ?? createAuthService(env, pool, deps.jobs, limiter);
  const enabled = Boolean(env.db && env.auth);
  const authCaps: AuthCapabilities = {
    enabled,
    // Not gated on a mail transport: sending is the worker's, and with none
    // configured a sign-in email waits on the queue rather than being refused
    // (#1895). What this reports is whether the method exists at all.
    magicLink: enabled,
    emailAndPassword: enabled,
    socialProviders: enabled
      ? SOCIAL_PROVIDERS.filter(
          (provider) => env.auth?.socialProviders[provider],
        )
      : [],
  };

  // Which topology this deployment is. This process only REPORTS it, on the
  // `status` procedure below: there is no HTTP gate any more, because nginx
  // serves the client (#1909) and no page path reaches here to be refused.
  // Enforcement is the client's `topologyGuard` (client/src/lib/deployment.ts),
  // which reads the mode from `status` and answers a route the other topology
  // owns with TanStack's `notFound()` — so this value is the whole input to
  // that gate, and a deployment that reported the wrong mode would open the
  // other topology's surfaces.
  const deployment = getDeploymentStatus(env.deploymentMode);

  // The instance's name and whether anybody owns it (#1909), for both status
  // surfaces. `status` is what a browser asks before it can render anything at
  // all, including the screen that explains an outage — so a database that
  // cannot be read answers `null` (the product name, and setup closed) rather
  // than failing the whole procedure. Nothing is cached: the answer changes
  // exactly once, when `/setup` completes, and the client asks once per load.
  const readInstallationRow: InstallationReader = async () => {
    if (!pool) return null;
    try {
      return await readInstallation(pool);
    } catch (error) {
      // oxlint-disable-next-line no-console -- server-side failure diagnostics
      console.error('Could not read the installation row for status:', error);
      return null;
    }
  };

  // One store for both the /storage routes below and the protocol builder's
  // content promotions — they name the same bytes — and for the readiness
  // probe, which is why it is built before the health routes are mounted.
  const assetStore = env.s3 ? createAssetStore(env.s3) : undefined;

  // Liveness and readiness (#1897). The worker serves these same routes on a
  // loopback listener of its own; what differs is which checks each process
  // runs, so the checks are assembled by the caller rather than by
  // createHealthRoutes. The object store is omitted where none is configured:
  // that surface refuses by design, and reporting it failed would make a
  // deployment that never wanted one permanently unready.
  app.route(
    '/',
    createHealthRoutes({
      ...(pool ? { db: databaseCheck(pool), schema: schemaCheck(pool) } : {}),
      ...(assetStore
        ? {
            objectStore: async () => {
              // The same bound the route applies, handed to the SDK as well:
              // a probe the route stopped waiting on would otherwise keep
              // retrying and holding a socket, once per check, for as long as
              // the endpoint stays unreachable.
              await assetStore.head(AbortSignal.timeout(CHECK_TIMEOUT_MS));
              return 'ok' as const;
            },
          }
        : {}),
      // `degraded`, never `failed`: the limiter fails open, so losing the
      // store changes what is enforced without making this process unfit to
      // serve — and taking the container out of rotation for it would turn a
      // rate-limit outage into an availability one. Omitted entirely where no
      // store is configured, like every other unconfigured surface.
      ...(limiter.configured ? { limiter: limiter.readiness } : {}),
    }),
  );

  // Per-email sign-in (#1909). better-auth keys its own limiter by address and
  // path and never looks inside the body, so the account this attempt names
  // has to be read here.
  app.on('POST', '/api/auth/*', async (c, next) => {
    const email = await signInEmailSubject(c, c.req.path.replace(/\/+$/, ''));
    if (email) {
      const decision = await limiter.check('sign_in_email', email);
      // The response says nothing the limiter's own log does not: the scope
      // and how long to wait. Never the address being refused.
      if (!decision.allowed) {
        return tooManyRequests(c, decision.retryAfterSeconds);
      }
    }
    await next();
    return undefined;
  });

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
    const response = await auth.handler(c.req.raw);
    // better-auth answers its own rate limit with a `{ message }` body and an
    // `X-Retry-After` header. Every other refusal on this server is problem
    // JSON with `Retry-After`, and a caller should not have to know which
    // limiter refused it in order to read the answer.
    if (response.status !== 429) return response;
    const retryAfter = Number(response.headers.get('X-Retry-After'));
    return tooManyRequests(
      c,
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.ceil(retryAfter)
        : Math.ceil(limiter.rules.sign_in_address.windowMs / 1000),
    );
  });

  // The public data API — a separate surface from the SPA's RPC below, per
  // the 2026-08-11 decision on #1248.
  //
  // Limited per client address, and deliberately not per `Authorization`
  // header (#1909). There is no token plane yet — `createPrincipalMiddleware`
  // resolves any Authorization header to no principal until #1899 builds one —
  // so a header is an unvalidated string, and keying on it would let an
  // anonymous caller mint a fresh bucket per request by rotating the value,
  // which is the address limit doing nothing at all. When a token is validated
  // the key becomes its resolved id, which cannot be minted.
  app.on(['GET', ...UNSAFE_METHODS], API_V1_PATHS, async (c, next) => {
    const decision = await limiter.check(
      'public_api',
      clientAddress(c, trustedProxies),
    );
    if (!decision.allowed) {
      return tooManyRequests(c, decision.retryAfterSeconds);
    }
    await next();
    return undefined;
  });
  app.route('/api/v1', createApiV1(authCaps, deployment, readInstallationRow));

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
  // Reads are limited per client address until a participant session token
  // exists to key them by (#1899). The limit is deliberately generous: an
  // interview fetches every stimulus it shows, and an institution often puts a
  // whole building behind one address.
  app.on('GET', STORAGE_PATHS, async (c, next) => {
    const decision = await limiter.check(
      'storage_read',
      clientAddress(c, trustedProxies),
    );
    if (!decision.allowed) {
      return tooManyRequests(c, decision.retryAfterSeconds);
    }
    await next();
    return undefined;
  });
  app.route('/storage', createAssetRoutes(assetStore));

  // The SPA's typed procedures (oRPC v2, decision recorded on #1244),
  // implementing the @codaco/studio-rpc boundary contract.
  if (env.auth) {
    app.use('/rpc/*', requireSameOrigin(env.auth.baseUrl));
  }
  app.use('/rpc/*', createPrincipalMiddleware(auth));
  // One cipher for the process. Absent only where no keyring was given, which
  // the env layer allows only where there is no database — and every surface
  // that would seal or open a secret needs one of those too (#1900).
  const cipher = env.secrets ? createSecretsCipher(env.secrets) : undefined;
  const rpcRouter = createRpcRouter(authCaps, {
    auth,
    deployment,
    readInstallation: readInstallationRow,
    jobs: deps.jobs,
    pool,
    protocolBuilder: createProtocolBuilderRuntime(),
    assetStore,
    cipher,
    limiter,
  });
  // The plugin puts a `resHeaders` Headers on every call's context and folds
  // whatever a procedure writes into the response. Two things write to it:
  // `setup.complete`, which signs the first owner in and so has to carry
  // better-auth's own `set-cookie` out of a procedure rather than out of
  // `/api/auth/*`, and a call the limiter refuses, which puts `Retry-After`
  // on its own response (#1909).
  //
  // The socket handler below gets no such plugin: a WebSocket frame has no
  // response headers at all, so a call refused over the socket carries its
  // retry-after in the error data and nowhere else.
  const rpcHandler = new RPCHandler(rpcRouter, {
    plugins: [new ResponseHeadersPlugin()],
  });
  // The same router over the socket: unary calls keep working on /rpc, and
  // the streaming procedure the fetch transport cannot serve — the protocol
  // builder's `watchProtocol` — is served here.
  const socketHandler = new WebSocketRPCHandler(rpcRouter);
  app.use('/rpc/*', async (c, next) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: '/rpc',
      context: {
        principal: c.get('principal'),
        requestId: randomUUID(),
        clientSessionId: readClientSessionId(
          c.req.header(CLIENT_SESSION_HEADER),
        ),
      },
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

  // The same RPC surface over a socket, behind the same origin check,
  // principal, and metrics the echo placeholder proved.
  if (env.auth) {
    app.use(WS_PATH, requireWsOrigin(env.auth.baseUrl));
  }
  app.use(WS_PATH, createPrincipalMiddleware(auth));
  app.use(WS_PATH, requirePrincipal());
  // After the principal, because the subject is the user. What this stops is a
  // reconnect loop becoming a connection storm: a tab opens one socket and
  // reopens it whenever the network drops.
  app.use(WS_PATH, async (c, next) => {
    const principal = c.get('principal');
    // Unreachable past requirePrincipal; narrowing rather than asserting.
    if (!principal) return next();
    const decision = await limiter.check('ws_upgrade', principal.userId);
    if (!decision.allowed) {
      return tooManyRequests(c, decision.retryAfterSeconds);
    }
    await next();
    return undefined;
  });
  app.get(
    WS_PATH,
    upgradeWebSocket(
      (c) => {
        const principal = c.get('principal');
        const requestId = randomUUID();
        // The socket is the presence identity, so it needs an id of its own.
        const connectionId = randomUUID();
        // The lock owner is the tab, which outlives its sockets. A browser
        // cannot put a header on a WebSocket handshake, so the tab names
        // itself on the upgrade URL; a client that names nothing falls back to
        // the connection and is its own owner for as long as it is connected.
        const clientSessionId = readClientSessionId(
          c.req.query(CLIENT_SESSION_PARAM),
        );
        return {
          onClose(_event, ws) {
            void socketHandler.close(ws).catch((error: unknown) => {
              // oxlint-disable-next-line no-console -- server-side failure diagnostics
              console.error(error);
            });
          },
          onError(event) {
            // oxlint-disable-next-line no-console -- server-side failure diagnostics
            console.error(event);
          },
          onMessage(event, ws) {
            const data: unknown = event.data;
            if (typeof data !== 'string' && !(data instanceof ArrayBuffer)) {
              // oxlint-disable-next-line no-console -- server-side failure diagnostics
              console.error(new Error('unreadable WebSocket frame'));
              return;
            }
            // Handed over before any await: the adapter's ordering guarantee
            // is per message, in arrival order.
            void socketHandler
              .message(ws, data, {
                context: {
                  principal,
                  requestId,
                  connectionId,
                  clientSessionId,
                },
              })
              .catch((error: unknown) => {
                // oxlint-disable-next-line no-console -- server-side failure diagnostics
                console.error(error);
              });
          },
        };
      },
      {
        onError: (error) => {
          // oxlint-disable-next-line no-console -- server-side failure diagnostics
          console.error(error);
        },
      },
    ),
  );

  return app;
}
