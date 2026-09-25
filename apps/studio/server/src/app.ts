import { RPCHandler as WebSocketRPCHandler } from '@orpc/server/websocket';
import { Cause, Effect, type Context as ServiceContext } from 'effect';
import { type Context, Hono } from 'hono';
import type pg from 'pg';

import { SOCIAL_PROVIDERS } from '@codaco/studio-rpc';

import { createApiV1 } from './api.ts';
import { assetStoreOf } from './assets.ts';
import { AuthService } from './auth/service.ts';
import { createPool } from './db/pool.ts';
import { UntenantedScope } from './db/tenant.ts';
import {
  type AuthCapabilities,
  getDeploymentStatus,
  type InstallationReader,
} from './domain.ts';
import { readEnv, type StudioEnv } from './env.ts';
import {
  type CheckVerdict,
  databaseCheck,
  type HealthChecks,
} from './http/health.ts';
import { createProtocolBuilderRuntime } from './protocol-builder/runtime.ts';
import type { RateLimiter } from './rate-limit/limiter.ts';
import { createRpcRouter, type RpcContext } from './rpc.ts';
import type { RpcDeps, StudioServices } from './rpc/deps.ts';
import { createSecretsCipher } from './secrets/cipher.ts';
import { readInstallation } from './setup/bootstrap.ts';
import type { ObjectStore } from './storage/object-store.ts';

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
  /**
   * The process's object store (`ObjectStore.layer`), for the protocol
   * builder's content promotions and the readiness probe. The `/storage`
   * routes ask the service itself. Absent, or unconfigured, means no bucket:
   * promotions are refused as unavailable and readiness names no store.
   */
  objectStore?: ObjectStore['Service'];
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

export type StudioHonoEnv = { Bindings: StudioBindings };

/**
 * What the `/ws` route feeds frames to. The upgrade's guards — the origin,
 * the principal and the per-user limit — are route middleware on the Effect
 * router (src/http/ws-bridge.ts), so all the bridge needs from here is the
 * router the admitted socket talks to.
 */
export type WsBridgeDeps = {
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
   * The object store this app was built over, which the `/storage` routes ask
   * for as a service in the same way (`__tests__/support/services.ts`).
   * Absent where none was given.
   */
  readonly objectStore?: ObjectStore['Service'] | undefined;
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
  // The HTTP-level limits are the Effect router's route middleware now; what
  // is left here is readiness and the protocol builder's per-user charge.
  const limiter = deps.limiter;

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

  // One store for the /storage routes, the protocol builder's content
  // promotions — they name the same bytes — and the readiness probe. The
  // routes ask the `ObjectStore` service the program provides; the promotions
  // take its promise view, because that router is still oRPC's.
  const objectStore = deps.objectStore?.configured
    ? deps.objectStore
    : undefined;
  const assetStore =
    objectStore === undefined ? undefined : assetStoreOf(objectStore);

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
    ...(objectStore
      ? {
          // The route's one-second bound interrupts this, and the store hands
          // every request its fiber's abort signal: a probe the route stopped
          // waiting on is ended rather than left retrying and holding a
          // socket, once per check, for as long as the endpoint stays
          // unreachable.
          objectStore: Effect.as(objectStore.head, 'ok' satisfies CheckVerdict),
        }
      : {}),
    // `degraded`, never `failed`: the limiter fails open, so losing the
    // store changes what is enforced without making this process unfit to
    // serve — and taking the container out of rotation for it would turn a
    // rate-limit outage into an availability one. Omitted entirely where no
    // store is configured, like every other unconfigured surface.
    ...(limiter?.configured ? { limiter: limiter.readiness } : {}),
  };

  // The public data API's handlers. Its limit is the Effect router's
  // (src/http/api-v1.ts), which forwards here once the caller is admitted.
  app.route('/api/v1', createApiV1(authCaps, deployment, readInstallationRow));

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
  // HTML for a caller to cache. The Effect router owns `/api/auth`, `/rpc`
  // and `/storage` now, so through it these answer only what it leaves
  // unregistered — a method `/api/auth` does not take, an `/api` path that is
  // neither — and the app on its own still answers all three.
  const notFound = (c: Context) =>
    c.json({ title: 'Not Found', status: 404 }, 404, {
      'Content-Type': 'application/problem+json',
    });
  for (const prefix of ['/api', '/rpc', '/storage']) {
    app.all(prefix, notFound);
    app.all(`${prefix}/*`, notFound);
  }

  return {
    app,
    ws: { socket: socketHandler },
    auth,
    limiter,
    objectStore,
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
