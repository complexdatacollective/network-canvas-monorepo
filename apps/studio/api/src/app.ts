import { Effect, type Context as ServiceContext } from 'effect';
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
  auth?: AuthService['Service'];
  readiness?: SqlClient.SqlClient;
  services?: ServiceContext.Context<StudioServices>;
  limiter?: RateLimiter['Service'];
  objectStore?: ObjectStore['Service'];
};

export type Studio = {
  readonly auth: AuthService['Service'];
  readonly limiter: RateLimiter['Service'] | undefined;
  readonly objectStore?: ObjectStore['Service'] | undefined;
  readonly rpc: RpcDeps;
  readonly checks: HealthChecks;
};

export function createStudio(
  env: StudioEnv = readEnv(),
  deps: CreateStudioDeps = {},
): Studio {
  const limiter = deps.limiter;

  const auth = deps.auth ?? AuthService.disabled;
  const enabled = Boolean(env.db && env.auth);
  const authCaps: AuthCapabilities = {
    enabled,
    // Not gated on a mail transport: sending is the worker's.
    magicLink: enabled,
    emailAndPassword: enabled,
    socialProviders: enabled
      ? SOCIAL_PROVIDERS.filter(
          (provider) => env.auth?.socialProviders[provider],
        )
      : [],
  };

  const deployment = getDeploymentStatus(env.deploymentMode);

  const readInstallationRow: InstallationReader =
    deps.services === undefined
      ? Effect.succeed(null)
      : UntenantedScope.open(readInstallation()).pipe(
          Effect.provide(deps.services),
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.logError(
                'Could not read the installation row for status',
                cause,
              ),
              null,
            ),
          ),
        );

  const objectStore = deps.objectStore?.configured
    ? deps.objectStore
    : undefined;

  const checks: HealthChecks = {
    ...(deps.readiness ? { db: databaseCheck(deps.readiness) } : {}),
    ...(objectStore
      ? {
          objectStore: Effect.as(objectStore.head, 'ok' satisfies CheckVerdict),
        }
      : {}),
    // `degraded`, never `failed`: the limiter fails open.
    ...(limiter?.configured ? { limiter: limiter.readiness } : {}),
  };

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
