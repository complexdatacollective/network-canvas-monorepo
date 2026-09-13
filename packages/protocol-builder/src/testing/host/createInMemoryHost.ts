import {
  createRouterClient,
  implement,
  withEventMeta,
  type RouterClient,
} from '@orpc/server';
import { v4 as uuid } from 'uuid';

import { contract } from '@codaco/protocol-builder-core/contract';
import type { ResourceDescriptor } from '@codaco/protocol-builder-core/contract/schemas';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';

import { OperationLedger } from './operationLedger.ts';
import { InMemoryProtocolStore, type HostPrincipal } from './protocolStore.ts';
import { InMemoryResourceStore, type EditScope } from './resourceStore.ts';

export type InMemoryHostContext = Readonly<{ principal: HostPrincipal }>;

const os = implement(contract).$context<InMemoryHostContext>();

const ASSETS = sectionId({ kind: 'assets' });

export type InMemoryHostSeed = Readonly<{
  protocolId?: string;
  sections: Readonly<Record<string, SectionDoc>>;
  /** Bytes for committed assets, keyed by the `source` the manifest names. */
  assetContent?: Readonly<Record<string, Blob>>;
  principal?: HostPrincipal;
  /** Overrides the ids `create` and resource staging mint, for readable tests. */
  nextId?: () => string;
}>;

const DEFAULT_PRINCIPAL: HostPrincipal = {
  sessionId: 'session-1',
  userId: 'user-1',
  displayName: 'Ada',
};

export type InMemoryRouter = ReturnType<typeof buildRouter>;
export type InMemoryClient = RouterClient<InMemoryRouter>;

export type InMemoryHost = Readonly<{
  protocolId: string;
  router: InMemoryRouter;
  client: InMemoryClient;
  /** A client for a second connection, which is a second lock owner. */
  asCollaborator(principal: HostPrincipal): InMemoryClient;
  store: InMemoryProtocolStore;
}>;

/**
 * The contract, served from memory.
 *
 * `asCollaborator` is the whole of the multi-editor story a test needs: a
 * second principal is a second lock owner, so a section one client holds is
 * read-only to the other and its submits are refused.
 */
export function createInMemoryHost(seed: InMemoryHostSeed): InMemoryHost {
  const protocolId = seed.protocolId ?? 'protocol-1';
  const nextId = seed.nextId ?? uuid;
  const store = new InMemoryProtocolStore(seed.sections, nextId);
  const resources = new InMemoryResourceStore(nextId, seed.assetContent ?? {});
  const router = buildRouter(
    protocolId,
    store,
    resources,
    new OperationLedger(),
  );
  const clientFor = (principal: HostPrincipal): InMemoryClient =>
    createRouterClient(router, { context: { principal } });
  return {
    protocolId,
    router,
    client: clientFor(seed.principal ?? DEFAULT_PRINCIPAL),
    asCollaborator: clientFor,
    store,
  };
}

function buildRouter(
  protocolId: string,
  store: InMemoryProtocolStore,
  resources: InMemoryResourceStore,
  ledger: OperationLedger,
) {
  const assets = (): SectionDoc => store.read(ASSETS).document;
  // Resources are scoped by protocol like everything else here: this host's
  // staged files and its asset manifest belong to one protocol, so a caller
  // naming another one is asking a host that does not exist.
  const elsewhere = (input: Readonly<{ protocolId: string }>): boolean =>
    input.protocolId !== protocolId;
  // Staging belongs to an edit in a session: the edit says which of a
  // researcher's open editors imported the file, the session says whose.
  const scopeOf = (
    context: InMemoryHostContext,
    editId: string,
  ): EditScope => ({ sessionId: context.principal.sessionId, editId });

  return {
    acquireLock: os.acquireLock.handler(({ input, context, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      if (!store.has(input.sectionId)) {
        throw errors.SECTION_NOT_FOUND({ data: input });
      }
      return store.acquire(input.sectionId, context.principal);
    }),

    releaseLock: os.releaseLock.handler(({ input, context, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      store.release(input.sectionId, context.principal);
    }),

    getSection: os.getSection.handler(({ input, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      if (!store.has(input.sectionId)) {
        throw errors.SECTION_NOT_FOUND({ data: input });
      }
      return store.read(input.sectionId);
    }),

    listSections: os.listSections.handler(({ input, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      return { sectionIds: store.sectionIds() };
    }),

    watchProtocol: os.watchProtocol.handler(async function* ({
      input,
      context,
      errors,
      lastEventId,
      signal,
    }) {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      // `lastEventId` is where this connection actually got to; `since` is
      // where it asked to start. A transport resuming a dropped socket
      // re-invokes with the same input, so starting from the input would hand
      // the client everything it had already been given.
      const since = laterCursor(input.since, lastEventId);
      for await (const entry of store.watch(context.principal, since, signal)) {
        yield withEventMeta(entry.event, { id: entry.cursor });
      }
    }),

    submit: os.submit.handler(({ input, context, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      if (!store.has(input.sectionId)) {
        throw errors.SECTION_NOT_FOUND({ data: input });
      }
      const key = {
        sessionId: context.principal.sessionId,
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
          scopeOf(context, promotion.editId),
          promotion.resourceIds,
          promotion.secretHandles,
        );
        if (manifest.status === 'failed') {
          throw errors.PROMOTION_FAILED({
            data: {
              sectionId: input.sectionId,
              failure: manifest.failure,
            },
          });
        }
        entries = manifest.data.entries;
        promoted = manifest.data.promoted;
      }
      const outcome = store.submit(
        input.sectionId,
        input.document,
        context.principal,
        entries,
      );
      if (outcome.status === 'notLockHolder') {
        throw errors.NOT_LOCK_HOLDER({
          data: {
            sectionId: input.sectionId,
            ...(outcome.holder === undefined ? {} : { holder: outcome.holder }),
          },
        });
      }
      if (outcome.status === 'blocked') {
        throw errors.SECTIONS_LOCKED({ data: { blocked: outcome.blocked } });
      }
      if (outcome.status === 'invalidShape') {
        throw errors.INVALID_SHAPE({
          data: { sectionId: input.sectionId, issues: outcome.issues },
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

    create: os.create.handler(({ input, context, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const key = {
        sessionId: context.principal.sessionId,
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
          scopeOf(context, promotion.editId),
          promotion.resourceIds,
          promotion.secretHandles,
        );
        if (manifest.status === 'failed') {
          throw errors.PROMOTION_FAILED({
            data: { failure: manifest.failure },
          });
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
        throw errors.SECTION_EXISTS({
          data: { sectionId: outcome.sectionId },
        });
      }
      if (outcome.status === 'blocked') {
        throw errors.SECTIONS_LOCKED({ data: { blocked: outcome.blocked } });
      }
      if (outcome.status === 'invalidShape') {
        throw errors.INVALID_SHAPE({
          data: { sectionId: outcome.sectionId, issues: outcome.issues },
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

    delete: os.delete.handler(({ input, context, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      if (!store.has(input.sectionId)) {
        throw errors.SECTION_NOT_FOUND({ data: input });
      }
      const ref = parseSectionId(input.sectionId);
      if (ref.kind !== 'stage') {
        throw errors.SECTION_NOT_FOUND({ data: input });
      }
      const outcome = store.deleteStage(ref.stageId, context.principal);
      if (outcome.status === 'blocked') {
        throw errors.SECTIONS_LOCKED({ data: { blocked: outcome.blocked } });
      }
      if (outcome.status === 'notFound') {
        throw errors.SECTION_NOT_FOUND({
          data: { sectionId: outcome.sectionId },
        });
      }
      if (outcome.status === 'referenced') {
        throw errors.REFERENCES_REMAIN({
          data: { remaining: outcome.remaining },
        });
      }
      return outcome;
    }),

    refactor: {
      deleteVariable: os.refactor.deleteVariable.handler(
        ({ input, context, errors }) => {
          if (input.protocolId !== protocolId) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const outcome = store.deleteVariable(
            input.subject,
            input.variableId,
            context.principal,
          );
          if (outcome.status === 'blocked') {
            throw errors.SECTIONS_LOCKED({
              data: { blocked: outcome.blocked },
            });
          }
          if (outcome.status === 'notFound') {
            throw errors.SECTION_NOT_FOUND({
              data: { sectionId: outcome.sectionId },
            });
          }
          if (outcome.status === 'referenced') {
            throw errors.REFERENCES_REMAIN({
              data: { remaining: outcome.remaining },
            });
          }
          return outcome;
        },
      ),
      deleteEntityType: os.refactor.deleteEntityType.handler(
        ({ input, context, errors }) => {
          if (input.protocolId !== protocolId) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const outcome = store.deleteEntityType(
            input.entity,
            input.typeId,
            context.principal,
          );
          if (outcome.status === 'blocked') {
            throw errors.SECTIONS_LOCKED({
              data: { blocked: outcome.blocked },
            });
          }
          if (outcome.status === 'notFound') {
            throw errors.SECTION_NOT_FOUND({
              data: { sectionId: outcome.sectionId },
            });
          }
          if (outcome.status === 'referenced') {
            throw errors.REFERENCES_REMAIN({
              data: { remaining: outcome.remaining },
            });
          }
          return outcome;
        },
      ),
    },

    resources: {
      list: os.resources.list.handler(({ input, context, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        // Committed resources are the protocol's; staged ones are this edit's,
        // and another editor's imports are no more part of this protocol than
        // the draft that will name them.
        const all = [
          ...resources.committedDescriptors(assets()),
          ...(input.editId === undefined
            ? []
            : resources.stagedDescriptors(scopeOf(context, input.editId))),
        ].filter(
          (descriptor) =>
            (input.kinds === undefined ||
              input.kinds.includes(descriptor.kind)) &&
            (input.status === undefined || descriptor.status === input.status),
        );
        return {
          status: 'ok' as const,
          data: { secretStorage: resources.secretStorage, resources: all },
        };
      }),

      stage: os.resources.stage.handler(({ input, context, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.stage(
          scopeOf(context, input.editId),
          input.requestId,
          input.request,
        );
      }),

      discard: os.resources.discard.handler(({ input, context, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.discard(
          scopeOf(context, input.editId),
          input.resourceId,
        );
      }),

      inspect: os.resources.inspect.handler(({ input, context, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.inspect(
          assets(),
          input.resourceId,
          input.editId === undefined
            ? undefined
            : scopeOf(context, input.editId),
        );
      }),

      preview: os.resources.preview.handler(({ input, context, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.preview(
          assets(),
          input.resourceId,
          input.editId === undefined
            ? undefined
            : scopeOf(context, input.editId),
        );
      }),
    },
  };
}

/**
 * The later of two cursors, either of which may be absent. This host's cursors
 * are its own event counter, which is what makes them comparable.
 */
function laterCursor(
  since: string | undefined,
  lastEventId: string | undefined,
): string | undefined {
  if (since === undefined) return lastEventId;
  if (lastEventId === undefined) return since;
  return Number(lastEventId) > Number(since) ? lastEventId : since;
}
