import {
  createRouterClient,
  implement,
  withEventMeta,
  type RouterClient,
} from '@orpc/server';
import { v4 as uuid } from 'uuid';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { contract } from '../../contract/contract.ts';
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
    }) {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const since = input.since ?? lastEventId;
      for await (const entry of store.watch(context.principal, since)) {
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
      const outcome = store.submit(
        input.sectionId,
        input.document,
        context.principal,
      );
      if (outcome.status === 'notLockHolder') {
        throw errors.NOT_LOCK_HOLDER({
          data: {
            sectionId: input.sectionId,
            ...(outcome.holder === undefined ? {} : { holder: outcome.holder }),
          },
        });
      }
      if (outcome.status === 'invalidShape') {
        throw errors.INVALID_SHAPE({
          data: { sectionId: input.sectionId, issues: outcome.issues },
        });
      }
      return { revision: outcome.revision };
    }),

    create: os.create.handler(({ input, errors }) => {
      if (input.protocolId !== protocolId) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const outcome = store.create(input.kind, input.document, input.position);
      if (outcome.status === 'invalidShape') {
        throw errors.INVALID_SHAPE({
          data: { sectionId: outcome.sectionId, issues: outcome.issues },
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
          return outcome;
        },
      ),
    },

    resources: {
      list: os.resources.list.handler(({ input }) => {
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

      stage: os.resources.stage.handler(({ input }) =>
        resources.stage(input.requestId, input.request),
      ),

      promote: os.resources.promote.handler(({ input }) => {
        const manifest = resources.manifestFor(
          input.promotionId,
          input.resourceIds,
        );
        if (manifest.status === 'failed') return manifest;
        const revision = store.mergeAssets(manifest.data.entries);
        resources.completePromotion(input.promotionId, input.resourceIds);
        return {
          status: 'ok' as const,
          data: {
            id: input.promotionId,
            promoted: manifest.data.promoted,
            revision,
          },
        };
      }),

      discard: os.resources.discard.handler(({ input }) =>
        resources.discard(input.resourceId),
      ),

      inspect: os.resources.inspect.handler(({ input }) =>
        resources.inspect(assets(), input.resourceId),
      ),

      preview: os.resources.preview.handler(({ input }) =>
        resources.preview(assets(), input.resourceId),
      ),
    },
  };
}
