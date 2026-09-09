import {
  createRouterClient,
  implement,
  withEventMeta,
  type RouterClient,
} from '@orpc/server';
import { v4 as uuid } from 'uuid';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { parseSectionId, sectionId } from '@codaco/studio-sync/taxonomy';

import { contract } from '../../contract/contract.ts';
import type { ResourceDescriptor } from '../../contract/schemas.ts';
import { InMemoryProtocolStore, type HostPrincipal } from './protocolStore.ts';
import { InMemoryResourceStore } from './resourceStore.ts';

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
  const router = buildRouter(protocolId, store, resources);
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
) {
  const assets = (): SectionDoc => store.read(ASSETS).document;
  // Resources are scoped by protocol like everything else here: this host's
  // staged files and its asset manifest belong to one protocol, so a caller
  // naming another one is asking a host that does not exist.
  const elsewhere = (input: Readonly<{ protocolId: string }>): boolean =>
    input.protocolId !== protocolId;

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
      const since = input.since ?? lastEventId;
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
      // The manifest is worked out before anything is written and committed
      // in the section's own revision, so a refused submit leaves the staged
      // resources staged and the protocol as it was.
      const promotion = input.promote;
      const already =
        promotion === undefined
          ? undefined
          : resources.completedPromotion(promotion.promotionId);
      // This id's attempt is already committed, so this call is the retry of
      // an answer that was lost: it is told what that attempt wrote. Writing
      // again would make a revision nothing changed in, and would refuse
      // outright once the editor had given its lock back — turning a save that
      // succeeded into one the researcher is told to discard a draft over.
      if (already !== undefined) {
        return { revision: already.revision, promoted: already.promoted };
      }
      let entries: Record<string, unknown> | undefined;
      let promoted: ResourceDescriptor[] | undefined;
      if (promotion !== undefined) {
        const manifest = resources.manifestFor(
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
        resources.completePromotion(
          promotion.promotionId,
          promoted ?? [],
          promotion.resourceIds,
          outcome.revision,
        );
      }
      return {
        revision: outcome.revision,
        ...(promoted === undefined ? {} : { promoted }),
      };
    }),

    create: os.create.handler(({ input, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const outcome = store.create(input.kind, input.document, input.position);
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
      return outcome;
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
      list: os.resources.list.handler(({ input, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        const all = [
          ...resources.committedDescriptors(assets()),
          ...resources.stagedDescriptors(),
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

      stage: os.resources.stage.handler(({ input, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.stage(input.requestId, input.request);
      }),

      discard: os.resources.discard.handler(({ input, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.discard(input.resourceId);
      }),

      inspect: os.resources.inspect.handler(({ input, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.inspect(assets(), input.resourceId);
      }),

      preview: os.resources.preview.handler(({ input, errors }) => {
        if (elsewhere(input)) throw errors.PROTOCOL_NOT_FOUND({ data: input });
        return resources.preview(assets(), input.resourceId);
      }),
    },
  };
}
