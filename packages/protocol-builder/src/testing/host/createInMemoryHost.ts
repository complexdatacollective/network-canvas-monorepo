import {
  Cause,
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  Queue,
  Scheduler,
  Stream,
} from 'effect';
import type * as Rpc from 'effect/unstable/rpc/Rpc';
import * as RpcTest from 'effect/unstable/rpc/RpcTest';
import { v4 as uuid } from 'uuid';

import { makeRpcAdapter } from '@codaco/effect-query/adapter';
import {
  ProtocolBuilderGroup,
  type ProtocolBuilderClient,
  type ProtocolBuilderRpcs,
} from '@codaco/protocol-builder-core/contract';
import {
  InvalidShape,
  NotLockHolder,
  PromotionFailed,
  ProtocolNotFound,
  ReferencesRemain,
  SectionExists,
  SectionNotFound,
  SectionsLocked,
} from '@codaco/protocol-builder-core/contract/errors';
import type {
  ProtocolEvent,
  ResourceDescriptor,
} from '@codaco/protocol-builder-core/contract/schemas';
import {
  HostCaller,
  HostSession,
} from '@codaco/protocol-builder-core/contract/session';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type { ProtocolBuilderAdapter } from '../../state/context.ts';
import { OperationLedger } from './operationLedger.ts';
import {
  InMemoryProtocolStore,
  type HostPrincipal,
  type LoggedEvent,
  type RefactorOutcome,
} from './protocolStore.ts';
import { InMemoryResourceStore, type EditScope } from './resourceStore.ts';

const ASSETS = sectionId({ kind: 'assets' });

export type InMemoryHostSeed = Readonly<{
  protocolId?: string;
  sections: Readonly<Record<string, SectionDoc>>;
  /** Bytes for committed assets, keyed by the `source` the manifest names. */
  assetContent?: Readonly<Record<string, Blob>>;
  principal?: HostPrincipal;
  /** Overrides the ids `Create` and resource staging mint, for readable tests. */
  nextId?: () => string;
}>;

const DEFAULT_PRINCIPAL: HostPrincipal = {
  sessionId: 'session-1',
  userId: 'user-1',
  displayName: 'Ada',
};

/** The in-process client a test host's adapter calls through. */
export class InMemoryHostClient extends Context.Service<
  InMemoryHostClient,
  ProtocolBuilderClient
>()('@codaco/protocol-builder/testing/InMemoryHostClient') {}

/** The procedures a layer serves, for a transport or an in-process client. */
export type HandlersLayer = Layer.Layer<Rpc.ToHandler<ProtocolBuilderRpcs>>;

/**
 * Stand-ins for some of the host's procedures. Each can call the host's own
 * through `host.handle`, so a test can hold an answer, lose one, or count the
 * calls without writing a host of its own.
 */
export type HandlerOverrides = {
  readonly [
    Current in ProtocolBuilderRpcs as Current['_tag']
  ]?: Rpc.ToHandlerFn<Current, HostCaller>;
};

export type InMemoryHost = Readonly<{
  protocolId: string;
  adapter: ProtocolBuilderAdapter;
  /** An adapter for a second connection, which is a second lock owner. */
  asCollaborator(principal: HostPrincipal): ProtocolBuilderAdapter;
  /**
   * An adapter as this host's principal (or `principal`) whose procedures are
   * `overrides` wherever they name one.
   */
  adapterWith(
    overrides: HandlerOverrides,
    principal?: HostPrincipal,
  ): ProtocolBuilderAdapter;
  /** The host's own procedures, for an override to call through to. */
  handle: InMemoryHandlers;
  /** The procedures over this host's stores, for a transport to serve. */
  handlers: HandlersLayer;
  store: InMemoryProtocolStore;
}>;

export type InMemoryHandlers = ReturnType<typeof buildHandlers>;

/**
 * The session every call on one connection runs as. A test host has no
 * credentials to check, so the caller is the principal it was built for.
 */
export function hostSessionFor(principal: HostPrincipal) {
  const caller = HostCaller.of({
    connectionId: principal.sessionId,
    clientSessionId: principal.sessionId,
    userId: principal.userId,
    displayName: principal.displayName,
  });
  return Layer.succeed(HostSession)(
    HostSession.of((effect) =>
      Effect.provideService(effect, HostCaller, caller),
    ),
  );
}

/**
 * Runs the host's fibers in microtasks, as a promise-returning host would
 * answer, rather than yielding to the event loop between steps: a test that
 * changes the protocol inside `act` sees the channel deliver it there.
 */
const inMicrotasks = Layer.succeed(Scheduler.Scheduler)(
  new Scheduler.MixedScheduler('sync'),
);

/**
 * An adapter over the handlers in process, as `principal`. No serialization:
 * what a handler answers is what the caller gets.
 */
export function inProcessAdapter(
  handlers: HandlersLayer,
  principal: HostPrincipal,
): ProtocolBuilderAdapter {
  const client = Layer.effect(InMemoryHostClient)(
    RpcTest.makeClient(ProtocolBuilderGroup, { flatten: true }),
  ).pipe(
    Layer.provide([handlers, hostSessionFor(principal)]),
    Layer.provideMerge(inMicrotasks),
  );
  return makeRpcAdapter<
    ProtocolBuilderRpcs,
    InMemoryHostClient,
    InMemoryHostClient
  >({
    runtime: ManagedRuntime.make(client),
    client: InMemoryHostClient,
  });
}

/**
 * The contract, served from memory.
 *
 * `asCollaborator` is the whole of the multi-editor story a test needs: a
 * second principal is a second lock owner, so a section one adapter holds is
 * read-only to the other and its submits are refused.
 */
export function createInMemoryHost(seed: InMemoryHostSeed): InMemoryHost {
  const protocolId = seed.protocolId ?? 'protocol-1';
  const nextId = seed.nextId ?? uuid;
  const store = new InMemoryProtocolStore(seed.sections, nextId);
  const resources = new InMemoryResourceStore(nextId, seed.assetContent ?? {});
  const principal = seed.principal ?? DEFAULT_PRINCIPAL;
  const handle = buildHandlers(
    protocolId,
    store,
    resources,
    new OperationLedger(),
  );
  const handlers = ProtocolBuilderGroup.toLayer(handle);
  return {
    protocolId,
    adapter: inProcessAdapter(handlers, principal),
    asCollaborator: (collaborator) => inProcessAdapter(handlers, collaborator),
    adapterWith: (overrides, as = principal) =>
      inProcessAdapter(
        ProtocolBuilderGroup.toLayer({ ...handle, ...overrides }),
        as,
      ),
    handle,
    handlers,
    store,
  };
}

const callerPrincipal = Effect.gen(function* () {
  const caller = yield* HostCaller;
  const principal: HostPrincipal = {
    sessionId: caller.connectionId,
    userId: caller.userId,
    displayName: caller.displayName,
  };
  return principal;
});

/** A replayable event carries the cursor it can be resumed from. */
function eventOf(entry: LoggedEvent): ProtocolEvent {
  return entry.event.type === 'presence'
    ? entry.event
    : { ...entry.event, cursor: entry.cursor };
}

function refactorAnswer(outcome: RefactorOutcome) {
  if (outcome.status === 'blocked') {
    return Effect.fail(new SectionsLocked({ blocked: outcome.blocked }));
  }
  if (outcome.status === 'notFound') {
    return Effect.fail(new SectionNotFound({ sectionId: outcome.sectionId }));
  }
  if (outcome.status === 'referenced') {
    return Effect.fail(new ReferencesRemain({ remaining: outcome.remaining }));
  }
  return Effect.succeed(outcome);
}

function buildHandlers(
  protocolId: string,
  store: InMemoryProtocolStore,
  resources: InMemoryResourceStore,
  ledger: OperationLedger,
) {
  const assets = (): SectionDoc => store.read(ASSETS).document;
  // Resources are scoped by protocol like everything else here: this host's
  // staged files and its asset manifest belong to one protocol, so a caller
  // naming another one is asking a host that does not exist.
  const inProtocol = (input: Readonly<{ protocolId: string }>) =>
    input.protocolId === protocolId
      ? Effect.void
      : Effect.fail(new ProtocolNotFound({ protocolId: input.protocolId }));
  const inSection = (id: ProtocolSectionId) =>
    store.has(id)
      ? Effect.void
      : Effect.fail(new SectionNotFound({ sectionId: id }));
  // Staging belongs to an edit in a session: the edit says which of a
  // researcher's open editors imported the file, the session says whose.
  const scopeOf = (principal: HostPrincipal, editId: string): EditScope => ({
    sessionId: principal.sessionId,
    editId,
  });

  return ProtocolBuilderGroup.of({
    AcquireLock: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      yield* inSection(input.sectionId);
      return store.acquire(input.sectionId, yield* callerPrincipal);
    }),

    ReleaseLock: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      store.release(input.sectionId, yield* callerPrincipal);
    }),

    GetSection: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      yield* inSection(input.sectionId);
      return store.read(input.sectionId);
    }),

    ListSections: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      return { sectionIds: store.sectionIds() };
    }),

    // Subscribed to the store before its backlog is read, and filtered by
    // cursor, inside `store.watch`: an event published between the two is
    // delivered once, and a resume from `since` is given only what came after.
    WatchProtocol: (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          yield* inProtocol(input);
          const principal = yield* callerPrincipal;
          return Stream.callback<ProtocolEvent>((queue) =>
            Effect.gen(function* () {
              const controller = new AbortController();
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => controller.abort()),
              );
              void (async () => {
                try {
                  for await (const entry of store.watch(
                    principal,
                    input.since,
                    controller.signal,
                  )) {
                    Queue.offerUnsafe(queue, eventOf(entry));
                  }
                  Queue.endUnsafe(queue);
                } catch (error: unknown) {
                  Queue.failCauseUnsafe(queue, Cause.die(error));
                }
              })();
            }),
          );
        }),
      ),

    Submit: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      yield* inSection(input.sectionId);
      const principal = yield* callerPrincipal;
      const key = {
        sessionId: principal.sessionId,
        operation: 'submit',
        requestId: input.requestId,
      } as const;
      // This request id's attempt is already committed, so this call is the
      // retry of an answer that was lost: it is told what that attempt wrote.
      const already = ledger.completed(key);
      if (already !== undefined) {
        return {
          revision: already.revision,
          ...(already.promoted === undefined
            ? {}
            : { promoted: [...already.promoted] }),
        };
      }
      // The manifest is worked out before anything is written and committed
      // in the section's own revision, so a refused submit leaves the staged
      // resources staged and the protocol as it was.
      const promotion = input.promote;
      let entries: Record<string, unknown> | undefined;
      let promoted: ResourceDescriptor[] | undefined;
      if (promotion !== undefined) {
        const manifest = resources.manifestFor(
          scopeOf(principal, promotion.editId),
          promotion.resourceIds,
        );
        if (manifest.status === 'failed') {
          return yield* new PromotionFailed({
            sectionId: input.sectionId,
            failure: manifest.failure,
          });
        }
        entries = manifest.data.entries;
        promoted = manifest.data.promoted;
      }
      const outcome = store.submit(
        input.sectionId,
        input.document,
        principal,
        entries,
      );
      if (outcome.status === 'notLockHolder') {
        return yield* new NotLockHolder({
          sectionId: input.sectionId,
          ...(outcome.holder === undefined ? {} : { holder: outcome.holder }),
        });
      }
      if (outcome.status === 'blocked') {
        return yield* new SectionsLocked({ blocked: outcome.blocked });
      }
      if (outcome.status === 'invalidShape') {
        return yield* new InvalidShape({
          sectionId: input.sectionId,
          issues: outcome.issues,
        });
      }
      if (promotion !== undefined) {
        resources.commitPromotion(promoted ?? [], promotion.resourceIds);
      }
      ledger.record(key, {
        revision: outcome.revision,
        ...(promoted === undefined ? {} : { promoted }),
      });
      return {
        revision: outcome.revision,
        ...(promoted === undefined ? {} : { promoted }),
      };
    }),

    Create: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      const principal = yield* callerPrincipal;
      const key = {
        sessionId: principal.sessionId,
        operation: 'create',
        requestId: input.requestId,
      } as const;
      // This request id's attempt is already committed, so this call is the
      // retry of an answer that was lost: it is told what that attempt made.
      // The section is named from the record rather than minted again, because
      // a second create would put a second copy of the stage in the protocol
      // and the retry would never learn about the first.
      const already = ledger.completed(key);
      if (already?.createdSection !== undefined) {
        return {
          sectionId: already.createdSection,
          revision: already.revision,
          ...(already.promoted === undefined
            ? {}
            : { promoted: [...already.promoted] }),
        };
      }
      // The manifest is worked out before anything is written, so a promotion
      // that cannot be committed leaves the protocol without the section and
      // the staged resources staged.
      const promotion = input.promote;
      let entries: Record<string, unknown> | undefined;
      let promoted: ResourceDescriptor[] | undefined;
      if (promotion !== undefined) {
        const manifest = resources.manifestFor(
          scopeOf(principal, promotion.editId),
          promotion.resourceIds,
        );
        if (manifest.status === 'failed') {
          return yield* new PromotionFailed({ failure: manifest.failure });
        }
        entries = manifest.data.entries;
        promoted = manifest.data.promoted;
      }
      const outcome = store.create(
        input.kind,
        input.document,
        input.position,
        entries,
      );
      if (outcome.status === 'exists') {
        return yield* new SectionExists({ sectionId: outcome.sectionId });
      }
      if (outcome.status === 'blocked') {
        return yield* new SectionsLocked({ blocked: outcome.blocked });
      }
      if (outcome.status === 'invalidShape') {
        return yield* new InvalidShape({
          sectionId: outcome.sectionId,
          issues: outcome.issues,
        });
      }
      if (promotion !== undefined) {
        resources.commitPromotion(promoted ?? [], promotion.resourceIds);
      }
      ledger.record(key, {
        revision: outcome.revision,
        createdSection: outcome.sectionId,
        ...(promoted === undefined ? {} : { promoted }),
      });
      return {
        sectionId: outcome.sectionId,
        revision: outcome.revision,
        ...(promoted === undefined ? {} : { promoted }),
      };
    }),

    Delete: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      yield* inSection(input.sectionId);
      const ref = parseSectionId(input.sectionId);
      if (ref.kind !== 'stage') {
        return yield* new SectionNotFound({ sectionId: input.sectionId });
      }
      return yield* refactorAnswer(
        store.deleteStage(ref.stageId, yield* callerPrincipal),
      );
    }),

    RefactorDeleteVariable: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      return yield* refactorAnswer(
        store.deleteVariable(
          input.subject,
          input.variableId,
          yield* callerPrincipal,
        ),
      );
    }),

    RefactorDeleteEntityType: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      return yield* refactorAnswer(
        store.deleteEntityType(
          input.entity,
          input.typeId,
          yield* callerPrincipal,
        ),
      );
    }),

    ResourcesList: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      const principal = yield* callerPrincipal;
      // Committed resources are the protocol's; staged ones are this edit's,
      // and another editor's imports are no more part of this protocol than
      // the draft that will name them.
      const all = [
        ...resources.committedDescriptors(assets()),
        ...(input.editId === undefined
          ? []
          : resources.stagedDescriptors(scopeOf(principal, input.editId))),
      ].filter(
        (descriptor) =>
          (input.kinds === undefined ||
            input.kinds.includes(descriptor.kind)) &&
          (input.status === undefined || descriptor.status === input.status),
      );
      return { status: 'ok' as const, data: { resources: all } };
    }),

    ResourcesStage: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      const principal = yield* callerPrincipal;
      const { request } = input;
      // This host keeps imported content as a `Blob`, the way a browser
      // holds a file; the contract carries it as bytes.
      const held =
        request.kind === 'content'
          ? {
              ...request,
              bytes: new Blob([new Uint8Array(request.bytes)], {
                type: request.contentType,
              }),
            }
          : request;
      return yield* Effect.promise(() =>
        resources.stage(
          scopeOf(principal, input.editId),
          input.requestId,
          held,
        ),
      );
    }),

    ResourcesDiscard: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      return resources.discard(
        scopeOf(yield* callerPrincipal, input.editId),
        input.resourceId,
      );
    }),

    ResourcesInspect: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      const principal = yield* callerPrincipal;
      return yield* Effect.promise(() =>
        resources.inspect(
          assets(),
          input.resourceId,
          input.editId === undefined
            ? undefined
            : scopeOf(principal, input.editId),
        ),
      );
    }),

    ResourcesPreview: Effect.fnUntraced(function* (input) {
      yield* inProtocol(input);
      const principal = yield* callerPrincipal;
      return yield* Effect.promise(() =>
        resources.preview(
          assets(),
          input.resourceId,
          input.editId === undefined
            ? undefined
            : scopeOf(principal, input.editId),
        ),
      );
    }),
  });
}
