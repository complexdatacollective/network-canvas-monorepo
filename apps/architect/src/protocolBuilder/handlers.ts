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
      const otherTab = (): Presence | undefined =>
        getProtocolLockState(store.getState()) === 'owned'
          ? undefined
          : {
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
            // A retry of a committed attempt: answered before the lock is
            // looked at, which the editor may already have given back.
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
            const held =
              promotion === undefined
                ? []
                : heldSections(revisions, [ASSETS_SECTION], input.sectionId);
            if (held.length > 0) {
              return yield* new SectionsLocked({ blocked: held });
            }
            // Settled before anything is written, so the protocol never points
            // at bytes that are not there.
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

        Create: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            const key = {
              operation: 'create' as const,
              requestId: input.requestId,
            };
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
            const changedSections = [...changed.keys()].filter(
              (id) => id !== input.sectionId,
            );
            return {
              revision,
              changedSections: [input.sectionId, ...changedSections],
            };
          }),

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

        ResourcesList: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
            return resources.list(input);
          }),

        ResourcesStage: (input) =>
          Effect.gen(function* () {
            yield* requireOpen(input.protocolId);
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
 * The watcher is ended through its abort signal rather than by returning its
 * iterator: a generator waiting for the next event cannot be returned from
 * until one arrives.
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

const OTHER_TAB_SESSION = 'protocol-held-in-another-tab';

type SectionHolder = Readonly<{
  sectionId: ProtocolSectionId;
  holder?: Presence;
}>;

function protocolHeldElsewhere(
  holder: Presence | undefined,
  writing: ProtocolSectionId,
): Readonly<{ blocked: SectionHolder[] }> | undefined {
  return holder === undefined
    ? undefined
    : { blocked: [{ sectionId: writing, holder }] };
}

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

function remainingReferences(
  state: RootState,
  hits: readonly { path: (string | number)[] }[],
): SectionReference[] {
  const stageIds = (getProtocol(state)?.stages ?? []).map((stage) => stage.id);
  return hits.map((hit) => sectionReferenceAt(hit.path, stageIds));
}

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
