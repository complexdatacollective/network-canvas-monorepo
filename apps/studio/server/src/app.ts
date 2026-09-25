import { RPCHandler as WebSocketRPCHandler } from '@orpc/server/websocket';
import { Cause, Effect, type Context as ServiceContext } from 'effect';
import { type Context, Hono } from 'hono';
import type pg from 'pg';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';

import { createApiV1 } from './api.ts';
import { createAssetRoutes, createAssetStore } from './assets.ts';
import { BETTER_AUTH_ORGANIZATION_ROUTE_POLICIES } from './audit/better-auth-policy.ts';
import { requireSameOrigin, requireWsOrigin } from './auth/csrf.ts';
import {
  createPrincipalMiddleware,
  type PrincipalVariables,
  requirePrincipal,
} from './auth/principal.ts';
import { AuthService, type SessionPrincipal } from './auth/service.ts';
import { createPool } from './db/pool.ts';
import { UntenantedScope } from './db/tenant.ts';
import {
  type AuthCapabilities,
  getDeploymentStatus,
  type InstallationReader,
} from './domain.ts';
import { readEnv, type StudioEnv } from './env.ts';
import {
  CHECK_TIMEOUT_MS,
  type CheckVerdict,
  databaseCheck,
  type HealthChecks,
} from './http/health.ts';
import { UNKNOWN_ADDRESS } from './http/middleware/client-address.ts';
import { createProtocolBuilderRuntime } from './protocol-builder/runtime.ts';
import type { RateLimitDecision, RateLimiter } from './rate-limit/limiter.ts';
import { RATE_LIMITS, type RateLimitScope } from './rate-limit/scopes.ts';
import { createRpcRouter, type RpcContext } from './rpc.ts';
import type { RpcDeps, StudioServices } from './rpc/deps.ts';
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
  /**
   * The process's auth provider: `AuthService.layerFromEnvironment`'s, built
   * by the program (`programs/serve.ts`) and handed down so the Hono residue
   * asks the same instance the rpc plane does. Absent means auth is off, which
   * is also what a suite that is not about auth gets.
   */
  auth?: AuthService['Service'];
  pool?: pg.Pool;
  /**
   * The Effect services every data-layer caller runs on (#1931 stage 3): the
   * application client, the operator signal, the job queue and the cipher.
   * Passed down by the program that owns the layers (`programs/serve.ts`), and
   * absent wherever there is no database — where every surface that needs one
   * refuses beside the missing pool.
   */
  services?: ServiceContext.Context<StudioServices>;
  /**
   * Where every limit this process enforces is counted (#1909): the
   * program's `RateLimiter`, built once over the process's store. Every
   * program passes one. Absent only in the suites that are not about
   * limiting, where nothing is limited and readiness names no limiter; a
   * suite that is about limiting builds one with the limits it wants to trip
   * (`support/valkey.ts`'s `openRateLimitStore`).
   */
  limiter?: RateLimiter['Service'];
};

/**
 * What the Effect shell resolved for this request and hands the Hono app as
 * its adapter bindings (src/http/hono-bridge.ts). Both are optional because
 * the suites still call `app.request(path)` with no bindings at all, and a
 * surface that reads one has to behave then as it did when it resolved the
 * value itself: one shared rate-limit bucket, and a request id of its own.
 */
export type StudioBindings = {
  readonly requestId?: string;
  readonly clientAddress?: string;
};

export type StudioHonoEnv = PrincipalVariables & { Bindings: StudioBindings };

/** Either the upgrade is admitted, or it is refused with the guards' own response. */
export type WsAdmission =
  | { readonly refused: Response }
  | { readonly principal: SessionPrincipal };

export type WsBridgeDeps = {
  /**
   * Runs the upgrade guards — the origin check, the principal, and the
   * per-user upgrade limit — over the handshake request, and answers either
   * the principal they resolved or the response they refused it with.
   */
  readonly admit: (request: Request) => Promise<WsAdmission>;
  /**
   * The RPC router over a socket; the bridge feeds it frames. Named as the
   * two methods the bridge calls rather than as the handler class, so that a
   * test of the bridge itself can stand a stub in its place — the real
   * `WebSocketRPCHandler` satisfies it because the type is taken from it.
   */
  readonly socket: Pick<WebSocketRPCHandler<RpcContext>, 'close' | 'message'>;
};

export type Studio = {
  readonly app: Hono<StudioHonoEnv>;
  readonly ws: WsBridgeDeps;
  /**
   * The auth provider and the limiter this app was built over. The Effect
   * shell's `/rpc` route asks for both as services; the programs provide them
   * from their own graph, which is where these came from, and a suite
   * composing the stack provides these (`__tests__/support/services.ts`).
   */
  readonly auth: AuthService['Service'];
  readonly limiter: RateLimiter['Service'] | undefined;
  /**
   * What the `/rpc` handlers are wired from. Resolved here because this is
   * where the pool and the cipher are decided, and handed to the Effect shell,
   * which owns the route (src/http/rpc-routes.ts).
   */
  readonly rpc: RpcDeps;
  /**
   * The readiness checks this process runs, minus `schema`: whether the
   * database is this build's is the program's verdict (SchemaStatus), not the
   * app's, because the program is what waited for it at boot.
   */
  readonly checks: HealthChecks;
};

export function createStudio(
  env: StudioEnv = readEnv(),
  deps: CreateAppDeps = {},
): Studio {
  const app = new Hono<StudioHonoEnv>();

  // Every limit this process enforces, counted in the shared store (#1909).
  // Read before anything is mounted because better-auth's own sign-in limiter
  // stores its counters through it too.
  const limiter = deps.limiter;
  const decide = (
    scope: RateLimitScope,
    subject: string,
  ): Promise<RateLimitDecision> =>
    limiter === undefined
      ? Promise.resolve({ allowed: true })
      : Effect.runPromise(limiter.check(scope, subject));

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
  const auth = deps.auth ?? AuthService.disabled;
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
    const services = deps.services;
    if (!services) return null;
    return Effect.runPromise(
      UntenantedScope.open(readInstallation()).pipe(
        Effect.provide(services),
        Effect.catchCause((cause) =>
          Effect.sync(() => {
            // oxlint-disable-next-line no-console -- server-side failure diagnostics
            console.error(
              'Could not read the installation row for status:',
              Cause.pretty(cause),
            );
            return null;
          }),
        ),
      ),
    );
  };

  // One store for both the /storage routes below and the protocol builder's
  // content promotions — they name the same bytes — and for the readiness
  // probe, which is why it is built before the checks are assembled.
  const assetStore = env.s3 ? createAssetStore(env.s3) : undefined;

  // Liveness and readiness are Effect routes now (src/http/health.ts): the
  // worker serves the same two on a loopback listener of its own, and what
  // differs is which checks each process runs — so the checks are assembled
  // here and the routes are mounted by the program. The object store is
  // omitted where none is configured: that surface refuses by design, and
  // reporting it failed would make a deployment that never wanted one
  // permanently unready.
  //
  // `schema` is not here. Whether the database is this build's is the
  // program's verdict, because the program is what waited for it at boot.
  const checks: HealthChecks = {
    ...(pool ? { db: databaseCheck(pool) } : {}),
    ...(assetStore
      ? {
          objectStore: Effect.map(
            Effect.tryPromise({
              // The same bound the route applies, handed to the SDK as well:
              // a probe the route stopped waiting on would otherwise keep
              // retrying and holding a socket, once per check, for as long as
              // the endpoint stays unreachable.
              try: () => assetStore.head(AbortSignal.timeout(CHECK_TIMEOUT_MS)),
              catch: (cause: unknown) => cause,
            }),
            (): CheckVerdict => 'ok',
          ),
        }
      : {}),
    // `degraded`, never `failed`: the limiter fails open, so losing the
    // store changes what is enforced without making this process unfit to
    // serve — and taking the container out of rotation for it would turn a
    // rate-limit outage into an availability one. Omitted entirely where no
    // store is configured, like every other unconfigured surface.
    ...(limiter?.configured ? { limiter: limiter.readiness } : {}),
  };

  // Per-email sign-in (#1909). better-auth keys its own limiter by address and
  // path and never looks inside the body, so the account this attempt names
  // has to be read here.
  app.on('POST', '/api/auth/*', async (c, next) => {
    const email = await signInEmailSubject(c, c.req.path.replace(/\/+$/, ''));
    if (email) {
      const decision = await decide('sign_in_email', email);
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
    const response = await Effect.runPromise(auth.handler(c.req.raw));
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
        : Math.ceil(
            (limiter?.rules ?? RATE_LIMITS).sign_in_address.windowMs / 1000,
          ),
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
    const decision = await decide(
      'public_api',
      c.env?.clientAddress ?? UNKNOWN_ADDRESS,
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
    const decision = await decide(
      'storage_read',
      c.env?.clientAddress ?? UNKNOWN_ADDRESS,
    );
    if (!decision.allowed) {
      return tooManyRequests(c, decision.retryAfterSeconds);
    }
    await next();
    return undefined;
  });
  app.route('/storage', createAssetRoutes(assetStore));

  // One cipher for the process. Absent only where no keyring was given, which
  // the env layer allows only where there is no database — and every surface
  // that would seal or open a secret needs one of those too (#1900).
  const cipher = env.secrets ? createSecretsCipher(env.secrets) : undefined;
  // What the `/rpc` handlers are wired from, resolved once and handed to the
  // Effect shell as `studio.rpc` (src/http/rpc-routes.ts). `/rpc` is not a
  // Hono route any more: the SPA's twenty procedures are Effect rpc handlers
  // served on the shell's own router, behind their own same-origin gate, and
  // the principal is resolved by the `Authenticated` middleware rather than by
  // a Hono middleware on this app.
  const rpcDeps: RpcDeps = {
    capabilities: authCaps,
    deployment,
    readInstallation: readInstallationRow,
    pool,
    assetStore,
    cipher,
    services: deps.services,
  };
  // The protocol builder over the socket, which is the only transport it has:
  // the streaming procedure the fetch transport could never serve — the
  // builder's `watchProtocol` — is served here, and so is everything else on
  // that router until stage 8 moves it onto the rpc plane.
  const socketHandler = new WebSocketRPCHandler<RpcContext>(
    createRpcRouter({
      ...rpcDeps,
      auth,
      limiter,
      protocolBuilder: createProtocolBuilderRuntime(),
    }),
  );

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
  // principal, and per-user limit the echo placeholder proved. The upgrade
  // itself is the Effect shell's now (src/http/ws-bridge.ts) — a Hono adapter
  // cannot hand a socket to the Effect server — so what stays here is the
  // guard chain, run over the handshake request as the middlewares it has
  // always been, answering either the principal they resolved or the response
  // they refused it with.
  //
  // The terminal handler records the principal for this Request and answers
  // 204: a middleware chain has no other way to hand a value back, and the
  // WeakMap is keyed by the handshake Request, which the bridge holds for
  // exactly as long as it is waiting for this answer.
  const wsPrincipals = new WeakMap<Request, SessionPrincipal>();
  const wsGuards = new Hono<StudioHonoEnv>();
  if (env.auth) {
    wsGuards.use(WS_PATH, requireWsOrigin(env.auth.baseUrl));
  }
  wsGuards.use(WS_PATH, createPrincipalMiddleware(auth));
  wsGuards.use(WS_PATH, requirePrincipal());
  // After the principal, because the subject is the user. What this stops is a
  // reconnect loop becoming a connection storm: a tab opens one socket and
  // reopens it whenever the network drops.
  wsGuards.use(WS_PATH, async (c, next) => {
    const principal = c.get('principal');
    // Unreachable past requirePrincipal; narrowing rather than asserting.
    if (!principal) return next();
    const decision = await decide('ws_upgrade', principal.userId);
    if (!decision.allowed) {
      return tooManyRequests(c, decision.retryAfterSeconds);
    }
    await next();
    return undefined;
  });
  wsGuards.get(WS_PATH, (c) => {
    const principal = c.get('principal');
    if (principal) wsPrincipals.set(c.req.raw, principal);
    return c.body(null, 204);
  });

  const admit = async (request: Request): Promise<WsAdmission> => {
    const response = await wsGuards.fetch(request);
    if (response.status !== 204) return { refused: response };
    const principal = wsPrincipals.get(request);
    wsPrincipals.delete(request);
    if (!principal) {
      // Unreachable past requirePrincipal; refusing rather than asserting.
      return {
        refused: Response.json(
          { title: 'Unauthorized', status: 401 },
          {
            status: 401,
            headers: { 'Content-Type': 'application/problem+json' },
          },
        ),
      };
    }
    return { principal };
  };

  return {
    app,
    ws: { admit, socket: socketHandler },
    auth,
    limiter,
    rpc: rpcDeps,
    checks,
  };
}

/**
 * The Hono half on its own, which is what every suite driving a request in
 * process still takes. The socket and the health routes are not reachable
 * through it — both belong to the Effect shell now — so a suite that needs
 * either composes the whole stack instead (src/__tests__/support/serve.ts).
 */
export function createApp(
  env: StudioEnv = readEnv(),
  deps: CreateAppDeps = {},
): Hono<StudioHonoEnv> {
  return createStudio(env, deps).app;
}
