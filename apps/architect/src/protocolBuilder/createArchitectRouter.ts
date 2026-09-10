import { createRouterClient, implement, withEventMeta } from '@orpc/server';

import {
  contract,
  type ProtocolBuilderClient,
} from '@codaco/protocol-builder/contract';
import type {
  Presence,
  Revision,
} from '@codaco/protocol-builder/contract/schemas';
import { contentHash } from '@codaco/studio-sync/apply';
import {
  sectionReferenceAt,
  type SectionReference,
} from '@codaco/studio-sync/section-references';
import { sectionShapeIssues } from '@codaco/studio-sync/section-validation';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';
import { hasOpenNestedEditor } from '~/components/DialogForm/nestedDraftRegistry';
import { getActiveProtocolId, getProtocolLockState } from '~/ducks/modules/app';
import {
  deleteTypeAsync,
  deleteVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import type { RootState } from '~/ducks/modules/root';
import { getIsUsed } from '~/selectors/codebook/isUsed';
import {
  getEntityTypeUsageHitsById,
  getVariableUsageHits,
} from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';
import {
  assetImportSurface,
  refusedCommitError,
} from '~/utils/protocolLockMessages';

import type { ArchitectStore } from './architectStore.ts';
import { ProtocolRevisions } from './protocolRevisions.ts';
import { ASSETS_SECTION, STAGE_ORDER_SECTION } from './protocolSections.ts';
import { ResourceBridge } from './resourceBridge.ts';
import {
  createSection,
  deleteStageSection,
  submitSection,
} from './sectionWrites.ts';
import { WriteLedger } from './writeLedger.ts';

const os = implement(contract);

/**
 * The protocol-builder host contract, served from Architect's Redux store.
 *
 * Everything the contract calls a write is an action Architect already has:
 * `commitStage` for a stage, whether it is being created or saved;
 * the codebook module's thunks for an entity type; the protocol-level actions
 * for the settings, the stage index and the asset manifest. Revisions are
 * derived from the committed protocol rather than written alongside it
 * (`ProtocolRevisions`), so the store stays the single record of what the
 * protocol is.
 *
 * Locks are granted to the tab that owns the protocol — one researcher, one
 * store — and they are kept, because the contract makes holding one the
 * precondition for a submit and an editor that never acquired one has a bug
 * the host should name.
 *
 * A tab that does NOT own the protocol is a reader. Architect's saved copy is
 * a library row one tab holds at a time, so a write raised in a demoted tab
 * would be taken into memory, look saved, and be dropped: the contract already
 * describes that situation — a section somebody else is editing — so it is
 * answered that way, and `otherTabName` is what an editor calls them.
 */
export function createArchitectRouter(
  store: ArchitectStore,
  otherTabName: string,
) {
  const revisions = new ProtocolRevisions(store);
  const resources = new ResourceBridge(store);
  const ledger = new WriteLedger();
  const isOpen = (protocolId: string) =>
    getActiveProtocolId(store.getState()) === protocolId;
  /**
   * The tab holding the saved copy, when it is not this one.
   *
   * `undefined` while this tab owns the protocol, which is what every write
   * below asks: a value here IS the refusal, and the presence it carries is
   * who the editor names.
   */
  const otherTab = (): Presence | undefined =>
    getProtocolLockState(store.getState()) === 'owned'
      ? undefined
      : {
          // Identity is the connection rather than the person, and the other
          // tab is the only connection Architect can name.
          sessionId: OTHER_TAB_SESSION,
          userId: OTHER_TAB_SESSION,
          displayName: otherTabName,
          mode: 'editing' as const,
        };

  return {
    acquireLock: os.acquireLock.handler(({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const state = revisions.read(input.sectionId);
      if (state === undefined) throw errors.SECTION_NOT_FOUND({ data: input });
      const holder = otherTab();
      // Read-only rather than refused outright: the researcher may still look
      // at the stage, and the editor that opens says who has it and takes its
      // fields out of reach — which is what stops a draft this tab could never
      // save from being typed in the first place.
      if (holder !== undefined) {
        return { lock: 'readOnly' as const, ...state, holder };
      }
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
      // `lastEventId` is where this connection actually got to; `since` is
      // where it asked to start. A transport resuming a dropped iterator
      // re-invokes it with the same input, so reading the input alone would
      // hand the client everything it had already been given.
      const since = laterCursor(input.since, lastEventId);
      for await (const entry of revisions.watch(since, signal)) {
        yield withEventMeta(entry.event, { id: entry.cursor });
      }
    }),

    submit: os.submit.handler(async ({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const key = { operation: 'submit' as const, requestId: input.requestId };
      // This request id's attempt is already committed, so this call is the
      // retry of an answer that was lost: it is told what that attempt wrote.
      // Answered before the section is read or the lock looked at, because
      // writing again would make a revision nothing changed in — and would
      // refuse outright once the editor had given its lock back, turning a
      // save that succeeded into one the researcher is told to discard a draft
      // over.
      const already = ledger.completed(key);
      if (already !== undefined) {
        return {
          revision: already.revision,
          ...(already.promoted === undefined
            ? {}
            : { promoted: [...already.promoted] }),
        };
      }
      const before = revisions.read(input.sectionId);
      if (before === undefined) throw errors.SECTION_NOT_FOUND({ data: input });
      const holder = otherTab();
      if (holder !== undefined) {
        throw errors.NOT_LOCK_HOLDER({
          data: { sectionId: input.sectionId, holder },
        });
      }
      const promotion = input.promote;
      if (revisions.holderOf(input.sectionId) === undefined) {
        throw errors.NOT_LOCK_HOLDER({ data: { sectionId: input.sectionId } });
      }
      const issues = sectionShapeIssues(input.sectionId, input.document);
      if (issues.length > 0) {
        throw errors.INVALID_SHAPE({
          data: { sectionId: input.sectionId, issues },
        });
      }
      // The manifest is a section like any other and a promotion writes it,
      // so it is taken on the terms every write outside the caller's own lock
      // uses. An editor holding it would submit its own whole manifest next,
      // over the entry this promotion added.
      const held =
        promotion === undefined
          ? []
          : heldSections(revisions, [ASSETS_SECTION], input.sectionId);
      if (held.length > 0) {
        throw errors.SECTIONS_LOCKED({ data: { blocked: held } });
      }
      // The promotion is settled before anything is written: a submit that
      // cannot commit the resources it names writes neither them nor the
      // section, so the protocol never points at bytes that are not there.
      const planned =
        promotion === undefined
          ? undefined
          : resources.planPromotion(
              promotion.editId,
              promotion.resourceIds,
              promotion.secretHandles,
            );
      if (planned?.status === 'failed') {
        throw errors.PROMOTION_FAILED({
          data: { sectionId: input.sectionId, failure: planned.failure },
        });
      }
      const promoted = planned?.data.promoted;
      const complete = (revision: Revision) => {
        ledger.record(key, {
          revision,
          ...(promoted === undefined ? {} : { promoted }),
        });
        if (planned === undefined) return;
        resources.completePromotion(planned.data.ids);
      };
      // Architect's timeline refuses to record a content-identical change, so
      // a resubmit of what is already committed is not a revision here either.
      if (contentHash(input.document) === before.revision.contentHash) {
        complete(before.revision);
        return {
          revision: before.revision,
          ...(promoted === undefined ? {} : { promoted }),
        };
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
      complete(after.revision);
      return {
        revision: after.revision,
        ...(promoted === undefined ? {} : { promoted }),
      };
    }),

    /**
     * Creates a section and registers its pointer in the same revision.
     *
     * It holds no lock, so the pointer section it writes — the stage index —
     * and the manifest a promotion writes have to be free: an editor holding
     * either has a whole-section draft that does not know about this create,
     * and its next submit would take the new stage back out of the order or
     * the promoted entry back out of the manifest.
     *
     * `promote` is here for the reason a submit cannot cover: a stage being
     * ADDED can carry a file the researcher imported while composing it, and
     * there is no earlier revision of that stage to have promoted it with.
     */
    create: os.create.handler(async ({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const key = { operation: 'create' as const, requestId: input.requestId };
      // This request id's attempt is already committed, so this call is the
      // retry of an answer that was lost: the section is named from the record
      // rather than minted again, because a second create would put a second
      // copy of the stage in the protocol and the retry would never learn of
      // the first.
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
      const blocked = protocolHeldElsewhere(otherTab(), STAGE_ORDER_SECTION);
      if (blocked !== undefined)
        throw errors.SECTIONS_LOCKED({ data: blocked });
      const promotion = input.promote;
      const held = heldSections(revisions, [
        ...(input.kind === 'stage' ? [STAGE_ORDER_SECTION] : []),
        ...(promotion === undefined ? [] : [ASSETS_SECTION]),
      ]);
      if (held.length > 0) {
        throw errors.SECTIONS_LOCKED({ data: { blocked: held } });
      }
      // Settled before anything is written, so a promotion that cannot be
      // committed leaves the protocol without the section. The refusal names
      // no section: the host mints an id only for one it is going to write.
      const planned =
        promotion === undefined
          ? undefined
          : resources.planPromotion(
              promotion.editId,
              promotion.resourceIds,
              promotion.secretHandles,
            );
      if (planned?.status === 'failed') {
        throw errors.PROMOTION_FAILED({ data: { failure: planned.failure } });
      }
      const { result } = await revisions.write(() =>
        createSection(store, input.kind, input.document, input.position),
      );
      if (result.status === 'exists') {
        throw errors.SECTION_EXISTS({ data: { sectionId: result.sectionId } });
      }
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
      if (planned !== undefined) {
        resources.completePromotion(planned.data.ids);
      }
      ledger.record(key, {
        revision: created.revision,
        createdSection: result.sectionId,
        ...(planned === undefined ? {} : { promoted: planned.data.promoted }),
      });
      return {
        sectionId: result.sectionId,
        revision: created.revision,
        ...(planned === undefined ? {} : { promoted: planned.data.promoted }),
      };
    }),

    /**
     * Removes a stage and its place in the stage order in one revision.
     *
     * It takes no lock and refuses while either section is held, this
     * session's own lock included: a stage editor holding the section would
     * put the stage back with its next whole-section submit.
     *
     * A stage other stages depend on is refused naming them, not swept: a skip
     * destination or the pedigree a narrative describes is a decision made
     * about that other stage, and rewriting it as a side effect of removing
     * this one is not a deletion anybody asked for.
     */
    delete: os.delete.handler(async ({ input, errors }) => {
      if (!isOpen(input.protocolId)) {
        throw errors.PROTOCOL_NOT_FOUND({ data: input });
      }
      const ref = parseSectionId(input.sectionId);
      if (
        ref.kind !== 'stage' ||
        revisions.read(input.sectionId) === undefined
      ) {
        throw errors.SECTION_NOT_FOUND({ data: input });
      }
      const blocked = protocolHeldElsewhere(otherTab(), input.sectionId);
      if (blocked !== undefined)
        throw errors.SECTIONS_LOCKED({ data: blocked });
      const held = heldSections(revisions, [
        input.sectionId,
        STAGE_ORDER_SECTION,
      ]);
      if (held.length > 0) {
        throw errors.SECTIONS_LOCKED({ data: { blocked: held } });
      }
      const { result, changed } = await revisions.write(() =>
        deleteStageSection(store, ref.stageId),
      );
      if (result.status === 'referenced') {
        throw errors.REFERENCES_REMAIN({
          data: { remaining: result.remaining },
        });
      }
      const [revision] = [...changed.values()];
      if (
        revision === undefined ||
        revisions.read(input.sectionId) !== undefined
      ) {
        throw new Error(`the store kept ${input.sectionId} after a delete`);
      }
      // The deleted section leads, as every host reports this change.
      const changedSections = [...changed.keys()].filter(
        (id) => id !== input.sectionId,
      );
      return {
        revision,
        changedSections: [input.sectionId, ...changedSections],
      };
    }),

    /**
     * Architect's compound codebook operations, as the contract's refactors.
     *
     * A section is never held by anyone else — the only lock table is this
     * router's — but a refactor is still refusable here, because Architect
     * deletes a variable or a type only when nothing references it and has no
     * path that strips the references out of the stages naming them (#1392).
     * That is the contract's `REFERENCES_REMAIN`: the change would leave
     * references this host cannot remove, and they are named where a codebook
     * dialog can show the researcher what is using the thing they are deleting.
     * Giving Architect the stripping path Studio has belongs with the adoption
     * in PR 4.
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
          const blocked = protocolHeldElsewhere(otherTab(), owner);
          if (blocked !== undefined) {
            throw errors.SECTIONS_LOCKED({ data: blocked });
          }
          try {
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
          } catch (error) {
            const state = store.getState();
            if (getIsUsed(state)[input.variableId] !== true) throw error;
            throw errors.REFERENCES_REMAIN({
              data: {
                remaining: remainingReferences(
                  state,
                  getVariableUsageHits(state, input.variableId),
                ),
              },
            });
          }
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
          const blocked = protocolHeldElsewhere(otherTab(), owner);
          if (blocked !== undefined) {
            throw errors.SECTIONS_LOCKED({ data: blocked });
          }
          try {
            const { changed } = await revisions.write(() =>
              store
                .dispatch(
                  deleteTypeAsync({ entity: input.entity, type: input.typeId }),
                )
                .unwrap(),
            );
            return refactorResult(revisions, changed, owner);
          } catch (error) {
            const state = store.getState();
            const hits = (
              getEntityTypeUsageHitsById(state).get(input.typeId) ?? []
            ).filter((hit) => hit.entity === input.entity);
            if (hits.length === 0) throw error;
            throw errors.REFERENCES_REMAIN({
              data: { remaining: remainingReferences(state, hits) },
            });
          }
        },
      ),
    },

    /**
     * The resource lifecycle, on the protocol that is open.
     *
     * Each of these names its protocol as every other procedure does, and is
     * refused the same way when that protocol is not the open one: Architect
     * holds one store, so a call from an editor the researcher has since
     * closed would otherwise import into — or discard from — whichever
     * protocol they opened next.
     */
    resources: {
      list: os.resources.list.handler(({ input, errors }) => {
        if (!isOpen(input.protocolId)) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        return resources.list(input);
      }),

      stage: os.resources.stage.handler(async ({ input, errors }) => {
        if (!isOpen(input.protocolId)) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        // An import writes bytes into a store keyed by the protocol id and then
        // names them in the manifest, so a demoted tab would leave a file
        // behind that the manifest entry naming it can never be saved beside.
        // The refusal is a failure of the gateway rather than a thrown error
        // because that is what every other thing this procedure cannot do is,
        // and the picker already has somewhere to say it.
        const importRefusal = refusedCommitError(
          getProtocolLockState(store.getState()),
          assetImportSurface(hasOpenNestedEditor()),
        );
        if (importRefusal !== null) {
          return {
            status: 'failed' as const,
            failure: {
              reason: 'read-only' as const,
              message: importRefusal,
              retryable: false,
            },
          };
        }
        return (
          await revisions.write(() =>
            resources.stage(input.editId, input.requestId, input.request),
          )
        ).result;
      }),

      discard: os.resources.discard.handler(async ({ input, errors }) => {
        if (!isOpen(input.protocolId)) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        return (
          await revisions.write(() =>
            resources.discard(input.editId, input.resourceId),
          )
        ).result;
      }),

      inspect: os.resources.inspect.handler(({ input, errors }) => {
        if (!isOpen(input.protocolId)) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        return resources.inspect(input.resourceId, input.editId);
      }),

      preview: os.resources.preview.handler(({ input, errors }) => {
        if (!isOpen(input.protocolId)) {
          throw errors.PROTOCOL_NOT_FOUND({ data: input });
        }
        return resources.preview(input.resourceId, input.editId);
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

/**
 * The one connection Architect can name: whichever tab holds the saved copy.
 *
 * Constant because there is exactly one of them from this tab's point of view
 * — the library row is held or it is not — and an editor that saw a new
 * identity on every read would report the holder changing while nothing had.
 */
const OTHER_TAB_SESSION = 'protocol-held-in-another-tab';

type SectionHolder = Readonly<{
  sectionId: ProtocolSectionId;
  holder?: Presence;
}>;

/**
 * A change spanning sections, refused because this tab does not hold the saved
 * copy of the protocol.
 *
 * `undefined` while it does. The section named is the one the caller was
 * writing: a refusal has to point somewhere, and the nearest true thing is
 * that this write's own section belongs to the other tab.
 */
function protocolHeldElsewhere(
  holder: Presence | undefined,
  writing: ProtocolSectionId,
): Readonly<{ blocked: SectionHolder[] }> | undefined {
  return holder === undefined
    ? undefined
    : { blocked: [{ sectionId: writing, holder }] };
}

/**
 * The sections of `ids` an editor holds that a write may not write through.
 *
 * `writing` names the one section the caller is changing under its own lock —
 * a submit's own — which is the only one of the list it may write. There is a
 * single principal here, so every other held section is this researcher's own
 * editor, and it is still a refusal: that editor's draft does not know about
 * this write and its next whole-section submit would undo it.
 */
function heldSections(
  revisions: ProtocolRevisions,
  ids: readonly ProtocolSectionId[],
  writing?: ProtocolSectionId,
): SectionHolder[] {
  const blocked: SectionHolder[] = [];
  for (const id of ids) {
    if (id === writing) continue;
    const holder = revisions.holderOf(id);
    if (holder === undefined) continue;
    blocked.push({ sectionId: id, holder });
  }
  return blocked;
}

/** The client `<ProtocolBuilder>` is handed: the router, called in process. */
export function createArchitectClient(
  store: ArchitectStore,
  otherTabName: string,
): ProtocolBuilderClient {
  return createRouterClient(createArchitectRouter(store, otherTabName));
}

/**
 * The references a refused refactor would have left behind, from the hits the
 * codebook's own "Used In" column is built from.
 *
 * The hits carry protocol coordinates, which the section translation turns
 * into a section and a path inside it — the same reading every host gives, so
 * a dialog naming what is still using a variable says the same thing wherever
 * it is hosted.
 */
function remainingReferences(
  state: RootState,
  hits: readonly { path: (string | number)[] }[],
): SectionReference[] {
  const stageIds = (getProtocol(state)?.stages ?? []).map((stage) => stage.id);
  return hits.map((hit) => sectionReferenceAt(hit.path, stageIds));
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
