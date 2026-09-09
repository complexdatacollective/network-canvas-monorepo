import { createRouterClient, implement, withEventMeta } from '@orpc/server';

import {
  contract,
  type ProtocolBuilderClient,
} from '@codaco/protocol-builder/contract';
import type { Revision } from '@codaco/protocol-builder/contract/schemas';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  validateSection,
  validateStageSectionIdentity,
  type SectionIssue,
} from '@codaco/studio-sync/section-validation';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';
import { getActiveProtocolId } from '~/ducks/modules/app';
import {
  deleteTypeAsync,
  deleteVariableAsync,
} from '~/ducks/modules/protocol/codebook';

import type { ArchitectStore } from './architectStore.ts';
import { ProtocolRevisions } from './protocolRevisions.ts';
import { ASSETS_SECTION } from './protocolSections.ts';
import { ResourceBridge } from './resourceBridge.ts';
import { createSection, submitSection } from './sectionWrites.ts';

const os = implement(contract);

function shapeIssues(
  id: ProtocolSectionId,
  document: SectionDoc,
): SectionIssue[] {
  const result = validateSection(id, document);
  const issues = result.success ? [] : [...result.issues];
  const ref = parseSectionId(id);
  if (ref.kind === 'stage') {
    const identity = validateStageSectionIdentity(ref.stageId, document);
    if (!identity.success) issues.push(...identity.issues);
  }
  return issues;
}

/**
 * The protocol-builder host contract, served from Architect's Redux store.
 *
 * Everything the contract calls a write is an action Architect already has:
 * `commitStageEditorDraft` for a stage, whether it is being created or saved;
 * the codebook module's thunks for an entity type; the protocol-level actions
 * for the settings, the stage index and the asset manifest. Revisions are
 * derived from the committed protocol rather than written alongside it
 * (`ProtocolRevisions`), so the store stays the single record of what the
 * protocol is.
 *
 * Locks are granted unconditionally — one researcher, one tab, one store — but
 * they are kept, because the contract makes holding one the precondition for a
 * submit and an editor that never acquired one has a bug the host should name.
 */
export function createArchitectRouter(store: ArchitectStore) {
  const revisions = new ProtocolRevisions(store);
  const resources = new ResourceBridge(store);
  const isOpen = (protocolId: string) =>
    getActiveProtocolId(store.getState()) === protocolId;

  return {
    acquireLock: os.acquireLock.handler(({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const state = revisions.read(input.sectionId);
      if (state === undefined) throw errors.SECTION_NOT_FOUND({ data: input });
      revisions.acquire(input.sectionId);
      return { lock: 'held' as const, ...state };
    }),

    releaseLock: os.releaseLock.handler(({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      revisions.release(input.sectionId);
    }),

    getSection: os.getSection.handler(({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const state = revisions.read(input.sectionId);
      if (state === undefined) throw errors.SECTION_NOT_FOUND({ data: input });
      return state;
    }),

    listSections: os.listSections.handler(({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      return { sectionIds: revisions.sectionIds() };
    }),

    watchProtocol: os.watchProtocol.handler(async function* ({
      input,
      errors,
      lastEventId,
      signal,
    }) {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const since = input.since ?? lastEventId;
      for await (const entry of revisions.watch(since, signal)) {
        yield withEventMeta(entry.event, { id: entry.cursor });
      }
    }),

    submit: os.submit.handler(async ({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const before = revisions.read(input.sectionId);
      if (before === undefined) throw errors.SECTION_NOT_FOUND({ data: input });
      if (revisions.holderOf(input.sectionId) === undefined) {
        throw errors.NOT_LOCK_HOLDER({ data: { sectionId: input.sectionId } });
      }
      const issues = shapeIssues(input.sectionId, input.document);
      if (issues.length > 0) {
        throw errors.INVALID_SHAPE({
          data: { sectionId: input.sectionId, issues },
        });
      }
      // Architect's timeline refuses to record a content-identical change, so
      // a resubmit of what is already committed is not a revision here either.
      if (contentHash(input.document) === before.revision.contentHash) {
        return { revision: before.revision };
      }
      const { result } = await revisions.write(() =>
        submitSection(store, parseSectionId(input.sectionId), input.document),
      );
      if (result.status === 'refused') {
        throw errors.INVALID_SHAPE({
          data: { sectionId: input.sectionId, issues: result.issues },
        });
      }
      const after = revisions.read(input.sectionId);
      if (after === undefined) throw errors.SECTION_NOT_FOUND({ data: input });
      return { revision: after.revision };
    }),

    create: os.create.handler(async ({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const { result } = await revisions.write(() =>
        createSection(store, input.kind, input.document, input.position),
      );
      if (result.status === 'refused') {
        throw errors.INVALID_SHAPE({
          data: { sectionId: result.sectionId, issues: result.issues },
        });
      }
      const created = revisions.read(result.sectionId);
      if (created === undefined) {
        throw errors.INVALID_SHAPE({
          data: {
            sectionId: result.sectionId,
            issues: [
              { path: [], message: 'the protocol store refused this section' },
            ],
          },
        });
      }
      return { sectionId: result.sectionId, revision: created.revision };
    }),

    /**
     * Architect's compound codebook operations, as the contract's refactors.
     *
     * Nothing is ever blocked: the only lock table is this router's, and a
     * section it holds is held by the caller. Architect refuses to delete a
     * variable or a type the protocol still references rather than stripping
     * the references — see this module's tests.
     */
    refactor: {
      deleteVariable: os.refactor.deleteVariable.handler(
        async ({ input, errors }) => {
          if (!isOpen(input.protocolId)) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const owner =
            input.subject.entity === 'ego'
              ? sectionId({ kind: 'codebookEgo' })
              : sectionId({
                  kind:
                    input.subject.entity === 'node'
                      ? 'codebookNode'
                      : 'codebookEdge',
                  typeId: input.subject.type,
                });
          const { changed } = await revisions.write(() =>
            store
              .dispatch(
                deleteVariableAsync({
                  entity: input.subject.entity,
                  ...(input.subject.entity === 'ego'
                    ? {}
                    : { type: input.subject.type }),
                  variable: input.variableId,
                }),
              )
              .unwrap(),
          );
          return refactorResult(revisions, changed, owner);
        },
      ),
      deleteEntityType: os.refactor.deleteEntityType.handler(
        async ({ input, errors }) => {
          if (!isOpen(input.protocolId)) {
            throw errors.PROTOCOL_NOT_FOUND({ data: input });
          }
          const owner = sectionId({
            kind: input.entity === 'node' ? 'codebookNode' : 'codebookEdge',
            typeId: input.typeId,
          });
          const { changed } = await revisions.write(() =>
            store
              .dispatch(
                deleteTypeAsync({ entity: input.entity, type: input.typeId }),
              )
              .unwrap(),
          );
          return refactorResult(revisions, changed, owner);
        },
      ),
    },

    resources: {
      list: os.resources.list.handler(({ input }) => resources.list(input)),

      stage: os.resources.stage.handler(
        async ({ input }) =>
          (
            await revisions.write(() =>
              resources.stage(input.requestId, input.request),
            )
          ).result,
      ),

      promote: os.resources.promote.handler(({ input }) => {
        const outcome = resources.promote(
          input.promotionId,
          input.resourceIds,
          input.secretHandles,
        );
        if (outcome.status === 'failed') return outcome;
        const assets = revisions.read(ASSETS_SECTION);
        if (assets === undefined) {
          return {
            status: 'failed' as const,
            failure: {
              reason: 'unavailable' as const,
              message: 'this protocol has no asset manifest',
              retryable: true,
            },
          };
        }
        return {
          status: 'ok' as const,
          data: {
            id: input.promotionId,
            promoted: outcome.data.promoted,
            revision: assets.revision,
          },
        };
      }),

      discard: os.resources.discard.handler(
        async ({ input }) =>
          (await revisions.write(() => resources.discard(input.resourceId)))
            .result,
      ),

      inspect: os.resources.inspect.handler(({ input }) =>
        resources.inspect(input.resourceId),
      ),

      preview: os.resources.preview.handler(({ input }) =>
        resources.preview(input.resourceId),
      ),
    },
  };
}

/** The client `<ProtocolBuilder>` is handed: the router, called in process. */
export function createArchitectClient(
  store: ArchitectStore,
): ProtocolBuilderClient {
  return createRouterClient(createArchitectRouter(store));
}

/**
 * The revision a refactor reached, and the sections it moved to get there.
 *
 * `changed` carries the revision of a removed section as well as a written
 * one, so a deletion is reportable. It is empty when the change was a no-op —
 * a variable that was already gone — and the section that owns the subject
 * then answers with the revision it still has.
 */
function refactorResult(
  revisions: ProtocolRevisions,
  changed: ReadonlyMap<ProtocolSectionId, Revision>,
  owner: ProtocolSectionId,
) {
  const changedSections = [...changed.keys()];
  const [revision] = [...changed.values()];
  if (revision !== undefined) return { revision, changedSections };
  const state = revisions.read(owner);
  if (state === undefined) {
    throw new Error(`no revision for ${owner} after a refactor`);
  }
  return { revision: state.revision, changedSections };
}
