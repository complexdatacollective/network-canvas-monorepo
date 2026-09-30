import { Effect, Queue, Stream } from 'effect';

import { ProtocolBuilderGroup } from '@codaco/protocol-builder-core/contract';
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
  Presence,
  ProtocolEvent,
  Revision,
} from '@codaco/protocol-builder-core/contract/schemas';
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
import { ProtocolRevisions, type LoggedEvent } from './protocolRevisions.ts';
import { ASSETS_SECTION, STAGE_ORDER_SECTION } from './protocolSections.ts';
import { ResourceBridge } from './resourceBridge.ts';
import {
  createSection,
  deleteStageSection,
  submitSection,
} from './sectionWrites.ts';
import { WriteLedger } from './writeLedger.ts';

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
export const ArchitectHandlers = (
  store: ArchitectStore,
  otherTabName: string,
) =>
  ProtocolBuilderGroup.toLayer(
    Effect.gen(function* () {
      const revisions = yield* Effect.acquireRelease(
        Effect.sync(() => new ProtocolRevisions(store)),
        (watching) => Effect.sync(() => watching.dispose()),
      );
      const resources = new ResourceBridge(store);
      const ledger = new WriteLedger();
      const isOpen = (protocolId: string) =>
        getActiveProtocolId(store.getState()) === protocolId;
      const requireOpen = (protocolId: string) =>
        isOpen(protocolId)
          ? Effect.void
          : Effect.fail(new ProtocolNotFound({ protocolId }));
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

      return ProtocolBuilderGroup.of({
        AcquireLock: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const state = revisions.read(input.sectionId);
            if (state === undefined) {
              return yield* new SectionNotFound({ sectionId: input.sectionId });
            }
            const holder = otherTab();
            // Read-only rather than refused outright: the researcher may still
            // look at the stage, and the editor that opens says who has it and
            // takes its fields out of reach — which is what stops a draft this
            // tab could never save from being typed in the first place.
            if (holder !== undefined) {
              return { lock: 'readOnly' as const, ...state, holder };
            }
            revisions.acquire(input.sectionId);
            return { lock: 'held' as const, ...state };
          }),

        ReleaseLock: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            revisions.release(input.sectionId);
          }),

        GetSection: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const state = revisions.read(input.sectionId);
            if (state === undefined) {
              return yield* new SectionNotFound({ sectionId: input.sectionId });
            }
            return state;
          }),

        ListSections: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            return { sectionIds: revisions.sectionIds() };
          }),

        WatchProtocol: (input) =>
          isOpen(input.protocolId)
            ? watchProtocol(revisions, input.since)
            : Stream.fail(
                new ProtocolNotFound({ protocolId: input.protocolId }),
              ),

        Submit: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const key = {
              operation: 'submit' as const,
              requestId: input.requestId,
            };
            // This request id's attempt is already committed, so this call is
            // the retry of an answer that was lost: it is told what that
            // attempt wrote. Answered before the section is read or the lock
            // looked at, because writing again would make a revision nothing
            // changed in — and would refuse outright once the editor had given
            // its lock back, turning a save that succeeded into one the
            // researcher is told to discard a draft over.
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
            if (before === undefined) {
              return yield* new SectionNotFound({ sectionId: input.sectionId });
            }
            const holder = otherTab();
            if (holder !== undefined) {
              return yield* new NotLockHolder({
                sectionId: input.sectionId,
                holder,
              });
            }
            const promotion = input.promote;
            if (revisions.holderOf(input.sectionId) === undefined) {
              return yield* new NotLockHolder({ sectionId: input.sectionId });
            }
            const issues = sectionShapeIssues(input.sectionId, input.document);
            if (issues.length > 0) {
              return yield* new InvalidShape({
                sectionId: input.sectionId,
                issues,
              });
            }
            // The manifest is a section like any other and a promotion writes
            // it, so it is taken on the terms every write outside the caller's
            // own lock uses. An editor holding it would submit its own whole
            // manifest next, over the entry this promotion added.
            const held =
              promotion === undefined
                ? []
                : heldSections(revisions, [ASSETS_SECTION], input.sectionId);
            if (held.length > 0) {
              return yield* new SectionsLocked({ blocked: held });
            }
            // The promotion is settled before anything is written: a submit
            // that cannot commit the resources it names writes neither them nor
            // the section, so the protocol never points at bytes that are not
            // there.
            const planned =
              promotion === undefined
                ? undefined
                : resources.planPromotion(
                    promotion.editId,
                    promotion.resourceIds,
                  );
            if (planned?.status === 'failed') {
              return yield* new PromotionFailed({
                sectionId: input.sectionId,
                failure: planned.failure,
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
            // Architect's timeline refuses to record a content-identical
            // change, so a resubmit of what is already committed is not a
            // revision here either.
            if (contentHash(input.document) === before.revision.contentHash) {
              complete(before.revision);
              return {
                revision: before.revision,
                ...(promoted === undefined ? {} : { promoted }),
              };
            }
            const { result } = yield* Effect.promise(() =>
              revisions.write(() =>
                submitSection(
                  store,
                  parseSectionId(input.sectionId),
                  input.document,
                ),
              ),
            );
            if (result.status === 'refused') {
              return yield* new InvalidShape({
                sectionId: input.sectionId,
                issues: result.issues,
              });
            }
            const after = revisions.read(input.sectionId);
            if (after === undefined) {
              return yield* new SectionNotFound({ sectionId: input.sectionId });
            }
            complete(after.revision);
            return {
              revision: after.revision,
              ...(promoted === undefined ? {} : { promoted }),
            };
          }),

        /**
         * Creates a section and registers its pointer in the same revision.
         *
         * It holds no lock, so the pointer section it writes — the stage index
         * — and the manifest a promotion writes have to be free: an editor
         * holding either has a whole-section draft that does not know about
         * this create, and its next submit would take the new stage back out of
         * the order or the promoted entry back out of the manifest.
         *
         * `promote` is here for the reason a submit cannot cover: a stage being
         * ADDED can carry a file the researcher imported while composing it,
         * and there is no earlier revision of that stage to have promoted it
         * with.
         */
        Create: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const key = {
              operation: 'create' as const,
              requestId: input.requestId,
            };
            // This request id's attempt is already committed, so this call is
            // the retry of an answer that was lost: the section is named from
            // the record rather than minted again, because a second create
            // would put a second copy of the stage in the protocol and the
            // retry would never learn of the first.
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
            const blocked = protocolHeldElsewhere(
              otherTab(),
              STAGE_ORDER_SECTION,
            );
            if (blocked !== undefined) {
              return yield* new SectionsLocked(blocked);
            }
            const promotion = input.promote;
            const held = heldSections(revisions, [
              ...(input.kind === 'stage' ? [STAGE_ORDER_SECTION] : []),
              ...(promotion === undefined ? [] : [ASSETS_SECTION]),
            ]);
            if (held.length > 0) {
              return yield* new SectionsLocked({ blocked: held });
            }
            // Settled before anything is written, so a promotion that cannot be
            // committed leaves the protocol without the section. The refusal
            // names no section: the host mints an id only for one it is going
            // to write.
            const planned =
              promotion === undefined
                ? undefined
                : resources.planPromotion(
                    promotion.editId,
                    promotion.resourceIds,
                  );
            if (planned?.status === 'failed') {
              return yield* new PromotionFailed({ failure: planned.failure });
            }
            const { result } = yield* Effect.promise(() =>
              revisions.write(() =>
                createSection(
                  store,
                  input.kind,
                  input.document,
                  input.position,
                ),
              ),
            );
            if (result.status === 'exists') {
              return yield* new SectionExists({ sectionId: result.sectionId });
            }
            if (result.status === 'refused') {
              return yield* new InvalidShape({
                sectionId: result.sectionId,
                issues: result.issues,
              });
            }
            const created = revisions.read(result.sectionId);
            if (created === undefined) {
              return yield* new InvalidShape({
                sectionId: result.sectionId,
                issues: [
                  {
                    path: [],
                    message: 'the protocol store refused this section',
                  },
                ],
              });
            }
            if (planned !== undefined) {
              resources.completePromotion(planned.data.ids);
            }
            ledger.record(key, {
              revision: created.revision,
              createdSection: result.sectionId,
              ...(planned === undefined
                ? {}
                : { promoted: planned.data.promoted }),
            });
            return {
              sectionId: result.sectionId,
              revision: created.revision,
              ...(planned === undefined
                ? {}
                : { promoted: planned.data.promoted }),
            };
          }),

        /**
         * Removes a stage and its place in the stage order in one revision.
         *
         * It takes no lock and refuses while either section is held, this
         * session's own lock included: a stage editor holding the section would
         * put the stage back with its next whole-section submit.
         *
         * A stage other stages depend on is refused naming them, not swept: a
         * skip destination or the pedigree a narrative describes is a decision
         * made about that other stage, and rewriting it as a side effect of
         * removing this one is not a deletion anybody asked for.
         */
        Delete: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const ref = parseSectionId(input.sectionId);
            if (
              ref.kind !== 'stage' ||
              revisions.read(input.sectionId) === undefined
            ) {
              return yield* new SectionNotFound({ sectionId: input.sectionId });
            }
            const blocked = protocolHeldElsewhere(otherTab(), input.sectionId);
            if (blocked !== undefined) {
              return yield* new SectionsLocked(blocked);
            }
            const held = heldSections(revisions, [
              input.sectionId,
              STAGE_ORDER_SECTION,
            ]);
            if (held.length > 0) {
              return yield* new SectionsLocked({ blocked: held });
            }
            const { result, changed } = yield* Effect.promise(() =>
              revisions.write(() => deleteStageSection(store, ref.stageId)),
            );
            if (result.status === 'referenced') {
              return yield* new ReferencesRemain({
                remaining: result.remaining,
              });
            }
            const [revision] = [...changed.values()];
            if (
              revision === undefined ||
              revisions.read(input.sectionId) !== undefined
            ) {
              return yield* Effect.die(
                new Error(`the store kept ${input.sectionId} after a delete`),
              );
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
         * Architect's compound codebook operations, as the contract's
         * refactors.
         *
         * A section is never held by anyone else — the only lock table is this
         * host's — but a refactor is still refusable here, because Architect
         * deletes a variable or a type only when nothing references it and has
         * no path that strips the references out of the stages naming them
         * (#1392). That is the contract's `ReferencesRemain`: the change would
         * leave references this host cannot remove, and they are named where a
         * codebook dialog can show the researcher what is using the thing they
         * are deleting. Giving Architect the stripping path Studio has belongs
         * with the adoption in PR 4.
         *
         * A failure that is not one of those references is not the contract's
         * to name, so it is a defect.
         */
        RefactorDeleteVariable: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
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
              return yield* new SectionsLocked(blocked);
            }
            const subject = input.subject;
            return yield* Effect.tryPromise({
              try: async () => {
                const { changed } = await revisions.write(() =>
                  store
                    .dispatch(
                      deleteVariableAsync({
                        entity: subject.entity,
                        ...(subject.entity === 'ego'
                          ? {}
                          : { type: subject.type }),
                        variable: input.variableId,
                      }),
                    )
                    .unwrap(),
                );
                return refactorResult(revisions, changed, owner);
              },
              catch: (error) => error,
            }).pipe(
              Effect.catch((error) => {
                const state = store.getState();
                if (getIsUsed(state)[input.variableId] !== true) {
                  return Effect.die(error);
                }
                return Effect.fail(
                  new ReferencesRemain({
                    remaining: remainingReferences(
                      state,
                      getVariableUsageHits(state, input.variableId),
                    ),
                  }),
                );
              }),
            );
          }),

        RefactorDeleteEntityType: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const owner = sectionId({
              kind: input.entity === 'node' ? 'codebookNode' : 'codebookEdge',
              typeId: input.typeId,
            });
            const blocked = protocolHeldElsewhere(otherTab(), owner);
            if (blocked !== undefined) {
              return yield* new SectionsLocked(blocked);
            }
            return yield* Effect.tryPromise({
              try: async () => {
                const { changed } = await revisions.write(() =>
                  store
                    .dispatch(
                      deleteTypeAsync({
                        entity: input.entity,
                        type: input.typeId,
                      }),
                    )
                    .unwrap(),
                );
                return refactorResult(revisions, changed, owner);
              },
              catch: (error) => error,
            }).pipe(
              Effect.catch((error) => {
                const state = store.getState();
                const hits = (
                  getEntityTypeUsageHitsById(state).get(input.typeId) ?? []
                ).filter((hit) => hit.entity === input.entity);
                if (hits.length === 0) return Effect.die(error);
                return Effect.fail(
                  new ReferencesRemain({
                    remaining: remainingReferences(state, hits),
                  }),
                );
              }),
            );
          }),

        /**
         * The resource lifecycle, on the protocol that is open.
         *
         * Each of these names its protocol as every other procedure does, and
         * is refused the same way when that protocol is not the open one:
         * Architect holds one store, so a call from an editor the researcher
         * has since closed would otherwise import into — or discard from —
         * whichever protocol they opened next.
         */
        ResourcesList: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            return resources.list(input);
          }),

        ResourcesStage: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            // An import writes bytes into a store keyed by the protocol id and
            // then names them in the manifest, so a demoted tab would leave a
            // file behind that the manifest entry naming it can never be saved
            // beside. The refusal is a failure of the gateway rather than a
            // contract error because that is what every other thing this
            // procedure cannot do is, and the picker already has somewhere to
            // say it.
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
            const { result } = yield* Effect.promise(() =>
              revisions.write(() =>
                resources.stage(input.editId, input.requestId, input.request),
              ),
            );
            return result;
          }),

        ResourcesDiscard: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const { result } = yield* Effect.promise(() =>
              revisions.write(() =>
                resources.discard(input.editId, input.resourceId),
              ),
            );
            return result;
          }),

        ResourcesInspect: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            return yield* Effect.promise(() =>
              resources.inspect(input.resourceId, input.editId),
            );
          }),

        ResourcesPreview: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            return yield* Effect.promise(() =>
              resources.preview(input.resourceId, input.editId),
            );
          }),
      });
    }),
  );

/**
 * The protocol's events from `since` onwards, each replayable one carrying the
 * cursor a resumed stream asks from.
 *
 * The log's watcher is ended through its abort signal rather than by returning
 * its iterator: a generator waiting for the next event cannot be returned from
 * until one arrives, and on a quiet protocol none may.
 */
const watchProtocol = (revisions: ProtocolRevisions, since?: string) =>
  Stream.callback<ProtocolEvent>((queue) =>
    Effect.promise(async (signal) => {
      for await (const entry of revisions.watch(since, signal)) {
        Queue.offerUnsafe(queue, withCursor(entry));
      }
      Queue.endUnsafe(queue);
    }).pipe(Effect.catchCause((cause) => Queue.failCause(queue, cause))),
  );

function withCursor({ cursor, event }: LoggedEvent): ProtocolEvent {
  return event.type === 'presence' ? event : { ...event, cursor };
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
