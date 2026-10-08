import { type Context, Effect, Layer, Predicate } from 'effect';
import { describe, expect, it } from 'vitest';

import { StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import { DeniedAttempts } from '../audit/denial-rate-limit.ts';
import { AuditSignal } from '../audit/signal.ts';
import { DatabaseAbsent } from '../db/client.ts';
import { getDeploymentStatus } from '../domain.ts';
import { Jobs } from '../jobs/jobs.ts';
import { JOB_SCHEMA } from '../jobs/queues.ts';
import { Analytics } from '../platform/analytics.ts';
import { RateLimiter } from '../rate-limit/limiter.ts';
import { RateLimitStore } from '../rate-limit/store.ts';
import type { RpcDeps } from '../rpc/deps.ts';
import { StudioRpcHandlers, StudioRpcMiddleware } from '../rpc/handlers.ts';
import { SecretsCipher } from '../secrets/services.ts';
import { AuthServiceStub } from './support/auth.ts';

const STUDIO_TAGS = [
  'account.updateLocale',
  'audit.filterOptions',
  'audit.get',
  'audit.list',
  'me',
  'participant.analytics',
  'participant.finish',
  'participant.redeem',
  'participant.session',
  'participant.sync',
  'protocols.addInformationStage',
  'protocols.create',
  'protocols.draft',
  'protocols.list',
  'protocols.moveStage',
  'setup.complete',
  'status',
  'status.updateAvailable',
  'studies.counts',
  'studies.create',
  'studies.get',
  'studies.list',
  'team.acceptInvitation',
  'team.cancelInvitation',
  'team.createInvitation',
  'team.updateMemberRole',
  'telemetry.report',
] as const;

const deps: RpcDeps = {
  capabilities: {
    enabled: false,
    magicLink: false,
    emailAndPassword: false,
    socialProviders: [],
  },
  deployment: getDeploymentStatus('self-hosted'),
  readInstallation: Effect.succeed(null),
};

/**
 * The key alone proves nothing: `toHandlers` writes one entry per rpc in the
 * group whether or not the object it was given implements it.
 */
function isHandlerEntry(entry: unknown): boolean {
  return (
    Predicate.hasProperty(entry, 'handler') &&
    Predicate.isFunction(entry.handler)
  );
}

function servesHandler(context: Context.Context<never>, key: string): boolean {
  const entry: unknown = context.mapUnsafe.get(key);
  return isHandlerEntry(entry);
}

const handlerContext = await Effect.runPromise(
  Effect.scoped(
    Layer.build(
      StudioRpcHandlers(deps).pipe(
        Layer.provide(
          Layer.mergeAll(
            DatabaseAbsent,
            SecretsCipher.layerAbsent,
            AuditSignal.layer,
            Analytics.layerDisabled,
            Jobs.layer({ schema: JOB_SCHEMA }),
            DeniedAttempts.layer.pipe(
              Layer.provide(RateLimitStore.layerAbsent),
            ),
            AuthServiceStub(),
            RateLimiter.layer.pipe(Layer.provide(RateLimitStore.layerAbsent)),
          ),
        ),
      ),
    ),
  ),
);

const middlewareContext = await Effect.runPromise(
  Effect.scoped(
    Layer.build(
      StudioRpcMiddleware(deps).pipe(
        Layer.provide(
          Layer.mergeAll(
            DatabaseAbsent,
            AuthServiceStub(),
            RateLimiter.layer.pipe(Layer.provide(RateLimitStore.layerAbsent)),
          ),
        ),
      ),
    ),
  ),
);

describe('the middleware served at /rpc', () => {
  it('provides exactly the middleware the procedures declare', () => {
    const declared = new Set(
      [...StudioRpcs.requests.values()].flatMap((rpc) =>
        [...rpc.middlewares].map((middleware) => middleware.key),
      ),
    );
    const provided = [...middlewareContext.mapUnsafe.entries()]
      .filter(([, entry]: [string, unknown]) => Predicate.isFunction(entry))
      .map(([key]) => key)
      .toSorted();

    expect(provided).toEqual([...declared].toSorted());
  });
});

describe('the handlers served at /rpc', () => {
  it('implements every procedure StudioRpcs declares', () => {
    const unimplemented = [...StudioRpcs.requests.values()]
      .filter((rpc) => !servesHandler(handlerContext, rpc.key))
      .map((rpc) => rpc._tag)
      .toSorted();

    expect(unimplemented).toEqual([]);
  });

  it('serves the pinned procedure list and nothing besides', () => {
    const declared = [...StudioRpcs.requests.keys()].toSorted();
    expect(declared).toEqual(STUDIO_TAGS.toSorted());

    const served = [...StudioRpcs.requests.values()]
      .filter((rpc) => servesHandler(handlerContext, rpc.key))
      .map((rpc) => rpc._tag)
      .toSorted();
    expect(served).toEqual(STUDIO_TAGS.toSorted());

    // Only handler entries are counted: `Layer.build` leaves its own memo map in
    // the context too.
    const declaredKeys = new Set(
      [...StudioRpcs.requests.values()].map((rpc) => rpc.key),
    );
    const unexpected = [...handlerContext.mapUnsafe.entries()]
      .filter(([key, entry]: [string, unknown]) => {
        return isHandlerEntry(entry) && !declaredKeys.has(key);
      })
      .map(([key]) => key)
      .toSorted();
    expect(unexpected).toEqual([]);
  });
});
