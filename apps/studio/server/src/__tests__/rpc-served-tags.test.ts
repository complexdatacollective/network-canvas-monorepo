// Every procedure the contract declares is actually implemented — and nothing
// else is.
//
// `RpcServer.layerHttp` asks for `Rpc.ToHandler<Rpcs>`, so a missing handler is
// a type error rather than a request that answers "unknown tag" in production.
// That is the compiler's guarantee, and it is only as good as the build: a
// handler dropped from one area's `toLayer` object still registers its tag —
// `RpcGroup.toHandlers` writes an entry for every rpc in the group and fills it
// with `handlers[tag]`, which is `undefined` for the one that went away. So this
// walks the built layer's context and reads the handler itself, not the key.
import { type Context, Effect, Layer, Predicate } from 'effect';
import { describe, expect, it } from 'vitest';

import { StudioRpcs } from '@codaco/studio-contract/rpc/studio';

import { AuditSignal } from '../audit/signal.ts';
import { DatabaseAbsent } from '../db/client.ts';
import { getDeploymentStatus } from '../domain.ts';
import { Jobs } from '../jobs/jobs.ts';
import { JOB_SCHEMA } from '../jobs/queues.ts';
import type { RpcDeps } from '../rpc/deps.ts';
import { StudioRpcHandlers } from '../rpc/handlers.ts';
import { SecretsCipherAbsent } from '../secrets/services.ts';
import { stubAuthService } from './support/auth.ts';

/**
 * The surface, written out by hand. It is the same list
 * `packages/studio-contract/src/__tests__/procedures.test.ts` pins (that file
 * declares `STUDIO_TAGS` locally rather than exporting it, and a test file in
 * another package is not an import target), so the two agree only while the
 * served set and the declared set do — which is the point: a procedure added to
 * the contract and left unimplemented fails here even though the contract's own
 * suite is green.
 */
const STUDIO_TAGS = [
  'account.updateLocale',
  'audit.filterOptions',
  'audit.get',
  'audit.list',
  'me',
  'protocols.addInformationStage',
  'protocols.create',
  'protocols.draft',
  'protocols.list',
  'protocols.moveStage',
  'setup.complete',
  'status',
  'studies.counts',
  'studies.create',
  'studies.get',
  'studies.list',
  'team.acceptInvitation',
  'team.cancelInvitation',
  'team.createInvitation',
  'team.updateMemberRole',
] as const;

/**
 * The least a handler layer can be built from: no pool, no cipher, no limiter
 * and no jobs. Registration is what is under test, and a procedure that needs
 * one of those asks for it when it runs, not when it is registered — so this
 * deliberately supplies none of them.
 */
const deps: RpcDeps = {
  auth: stubAuthService(),
  capabilities: {
    enabled: false,
    magicLink: false,
    emailAndPassword: false,
    socialProviders: [],
  },
  deployment: getDeploymentStatus('self-hosted'),
  readInstallation: () => Promise.resolve(null),
};

/**
 * An entry `RpcGroup.toLayer` wrote: `{ tag, handler, context }`, with a
 * callable handler.
 *
 * The map is typed `ReadonlyMap<string, any>`, so an entry is read as `unknown`
 * and narrowed with `Predicate` rather than asserted. The handler itself is what
 * is read, because the key alone proves nothing — `toHandlers` writes one entry
 * per rpc in the group whether or not the object it was given implements it.
 */
function isHandlerEntry(entry: unknown): boolean {
  return (
    Predicate.hasProperty(entry, 'handler') &&
    Predicate.isFunction(entry.handler)
  );
}

/**
 * Whether the built context carries a handler under an rpc's key.
 *
 * `Rpc.Handler` is keyed by tag (`Rpc.ts`: `key = "effect/rpc/Rpc/" + _tag`).
 */
function servesHandler(context: Context.Context<never>, key: string): boolean {
  const entry: unknown = context.mapUnsafe.get(key);
  return isHandlerEntry(entry);
}

// The stand-ins rather than a database: this suite asks which handlers were
// registered, and every one of them is a layer that has not run yet.
const handlerContext = await Effect.runPromise(
  Effect.scoped(
    Layer.build(
      StudioRpcHandlers(deps).pipe(
        Layer.provide(
          Layer.mergeAll(
            DatabaseAbsent,
            SecretsCipherAbsent,
            AuditSignal.layer,
            Jobs.layer({ schema: JOB_SCHEMA }),
          ),
        ),
      ),
    ),
  ),
);

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
    // The contract's own list first: this file's copy is only meaningful while
    // it is the same surface `procedures.test.ts` pins.
    expect(declared).toEqual(STUDIO_TAGS.toSorted());

    const served = [...StudioRpcs.requests.values()]
      .filter((rpc) => servesHandler(handlerContext, rpc.key))
      .map((rpc) => rpc._tag)
      .toSorted();
    expect(served).toEqual(STUDIO_TAGS.toSorted());

    // Nothing the merged group never declared: the seven area layers contribute
    // one handler per procedure and nothing else, so an area layer built against
    // a different group, or a stray handler merged in, shows here. Only handler
    // entries are counted — `Layer.build` leaves its own memo map in the context
    // too, and that is the builder's, not a served procedure.
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
