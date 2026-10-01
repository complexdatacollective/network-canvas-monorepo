import { Cause, Effect, type Context as ServiceContext } from 'effect';
import type { SqlClient } from 'effect/sql';

import { SOCIAL_PROVIDERS } from '@codaco/studio-contract/schema/status';

import { AuthService } from './auth/service.ts';
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
import type { RateLimiter } from './rate-limit/limiter.ts';
import type { RpcDeps, StudioServices } from './rpc/deps.ts';
import { readInstallation } from './setup/bootstrap.ts';
import type { ObjectStore } from './storage/object-store.ts';

type CreateStudioDeps = {
  /**
   * The process's auth provider: `AuthService.layerFromEnvironment`'s, built
   * by the program (`programs/serve.ts`) and handed down so the auth mount
   * and the rpc plane ask the same instance. Absent means auth is off, which
   * is also what a suite that is not about auth gets.
   */
  auth?: AuthService['Service'];
  /** The client `/readyz`'s database check runs on; absent, readiness names no database. */
  readiness?: SqlClient.SqlClient;
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
   * The process's object store (`ObjectStore.layer`), for the readiness
   * probe. The `/storage` routes and the protocol builder's content
   * promotions ask the service itself. Absent, or unconfigured, means no
   * bucket: readiness names no store.
   */
  objectStore?: ObjectStore['Service'];
};

export type Studio = {
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
   * where the cipher is decided, and handed to the Effect shell,
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
  deps: CreateStudioDeps = {},
): Studio {
  // Every limit this process enforces, counted in the shared store (#1909).
  // The HTTP-level limits are the Effect router's route middleware now, and
  // the rpc planes charge theirs through the `RateLimiter` service; what is
  // left here is readiness.
  const limiter = deps.limiter;

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
  // Enforcement is the client's `topologyGuard` (web/src/lib/deployment.ts),
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
  // routes and the protocol builder ask the `ObjectStore` service the program
  // provides; this is the readiness half.
  const objectStore = deps.objectStore?.configured
    ? deps.objectStore
    : undefined;

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
    ...(deps.readiness ? { db: databaseCheck(deps.readiness) } : {}),
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

  // What the `/rpc` handlers are wired from, resolved once and handed to the
  // Effect shell as `studio.rpc` (src/http/rpc-routes.ts), which serves the
  // SPA's procedures behind their own same-origin gate, with the principal
  // resolved by the `Authenticated` middleware.
  const rpcDeps: RpcDeps = {
    capabilities: authCaps,
    deployment,
    readInstallation: readInstallationRow,
    services: deps.services,
  };
  return {
    auth,
    limiter,
    objectStore,
    rpc: rpcDeps,
    checks,
  };
}
