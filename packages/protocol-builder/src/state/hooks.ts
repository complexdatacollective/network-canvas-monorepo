import { safe } from '@orpc/client';
import {
  skipToken,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type {
  Presence,
  ResourceDescriptor,
  ResourceGatewayFailureSchema,
  ResourcePromotionRequestSchema,
  Revision,
  SectionHolderSchema,
  SectionIssueSchema,
} from '../contract/schemas.ts';
import {
  lockQueryKey,
  useProtocolBuilderContext,
  type LockState,
} from './context.ts';
import { useKeptRequestId } from './requestKey.ts';

export type SectionAtRevision = Readonly<{
  document: SectionDoc;
  revision: Revision;
}>;

export type SectionIssue = z.output<typeof SectionIssueSchema>;
export type ResourcePromotion = z.output<typeof ResourcePromotionRequestSchema>;
export type ResourceFailure = z.output<typeof ResourceGatewayFailureSchema>;
export type SectionHolder = z.output<typeof SectionHolderSchema>;

const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

/**
 * One section, as the protocol currently holds it.
 *
 * `select` narrows the observer to the slice it renders, so a component
 * showing a node type's name and colour is not re-rendered by a change to a
 * variable inside it.
 */
export function useSection<TSelected = SectionAtRevision>(
  id: ProtocolSectionId,
  select?: (section: SectionAtRevision) => TSelected,
): TSelected | undefined {
  const { protocolId, utils } = useProtocolBuilderContext();
  const { data } = useQuery({
    ...utils.getSection.queryOptions({ input: { protocolId, sectionId: id } }),
    select,
  });
  return data;
}

export type EntityTypeSummary = Readonly<{
  id: string;
  name: string;
  color?: string;
  /** How a node of this type is drawn. Node types only; edges have no shape. */
  shape?: string;
}>;

/** Every node or edge type in the codebook, for a picker's options. */
export function useEntityTypes(
  entity: 'node' | 'edge',
): readonly EntityTypeSummary[] {
  const { protocolId, utils } = useProtocolBuilderContext();
  const kind = entity === 'node' ? 'codebookNode' : 'codebookEdge';
  const { data: list } = useQuery(
    utils.listSections.queryOptions({ input: { protocolId } }),
  );
  const ids = (list?.sectionIds ?? []).filter(
    (candidate) => parseSectionId(candidate).kind === kind,
  );

  return useQueries({
    queries: ids.map((id) => ({
      ...utils.getSection.queryOptions({
        input: { protocolId, sectionId: id },
      }),
      select: (section: SectionAtRevision): EntityTypeSummary =>
        entityTypeSummary(id, section.document),
    })),
    combine: (results) =>
      results.flatMap((result) =>
        result.data === undefined ? [] : [result.data],
      ),
  });
}

export type StageSummary = Readonly<{
  id: string;
  type: string;
  label: string;
}>;

/** The protocol's stages in order, for a destination picker or a heading. */
export function useStageIndex(): readonly StageSummary[] {
  const { protocolId, utils } = useProtocolBuilderContext();
  const stageIds = useSection(STAGE_ORDER, (section) =>
    stageIdsOf(section.document),
  );
  const ids = stageIds ?? [];

  return useQueries({
    queries: ids.map((id) => ({
      ...utils.getSection.queryOptions({
        input: {
          protocolId,
          sectionId: sectionId({ kind: 'stage', stageId: id }),
        },
      }),
      select: (section: SectionAtRevision): StageSummary =>
        stageSummary(id, section.document),
    })),
    combine: (results) =>
      results.flatMap((result) =>
        result.data === undefined ? [] : [result.data],
      ),
  });
}

/**
 * How far through the protocol's history this client has been brought.
 *
 * Every section carries the revision it was last written at, so the newest of
 * them is the last revision the channel delivered — which is what a host
 * command fenced on the protocol's revision has to quote, and what tells a
 * caller whether the protocol it is looking at is the one the host holds.
 * `undefined` until a section has been read.
 */
export function useProtocolRevision(): bigint | undefined {
  const { protocolId, utils } = useProtocolBuilderContext();
  const { data: list } = useQuery(
    utils.listSections.queryOptions({ input: { protocolId } }),
  );
  const ids = list?.sectionIds ?? [];

  return useQueries({
    queries: ids.map((id) => ({
      ...utils.getSection.queryOptions({
        input: { protocolId, sectionId: id },
      }),
      select: (section: SectionAtRevision): bigint => section.revision.sequence,
    })),
    combine: (results) =>
      results.reduce<bigint | undefined>(
        (newest, result) =>
          result.data !== undefined &&
          (newest === undefined || result.data > newest)
            ? result.data
            : newest,
        undefined,
      ),
  });
}

/**
 * Reads the whole protocol again from the host.
 *
 * For a write made through a surface of the host's OWN, beside this contract:
 * Studio's `protocols.addInformationStage` and `protocols.moveStage` advance
 * the draft without publishing a revision, so nothing about them reaches the
 * channel and this is the only way the cache learns what they wrote. A change
 * made through this contract arrives on the channel and needs none of it.
 *
 * The list is read first and awaited, so a section the write ADDED is one the
 * readers of the protocol then observe for themselves. Rejects when the host
 * cannot be re-read, which leaves the caller holding a write whose result it
 * could not see.
 */
export function useRereadProtocol(): () => Promise<void> {
  const { protocolId, utils } = useProtocolBuilderContext();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.invalidateQueries(
      { queryKey: utils.listSections.key({ input: { protocolId } }) },
      { throwOnError: true },
    );
    await queryClient.invalidateQueries(
      { queryKey: utils.getSection.key({ input: { protocolId } }) },
      { throwOnError: true },
    );
  }, [protocolId, queryClient, utils]);
}

export type SubmitResult =
  /**
   * `promoted` describes what the submit's promotion committed — the host's
   * own metadata for each resource, which staging did not know — so an editor
   * can settle the staged rows it was holding. Absent when nothing was
   * promoted.
   */
  | Readonly<{
      status: 'written';
      revision: Revision;
      promoted?: readonly ResourceDescriptor[];
    }>
  | Readonly<{ status: 'notLockHolder'; holder?: Presence }>
  | Readonly<{ status: 'sectionsLocked'; blocked: readonly SectionHolder[] }>
  | Readonly<{ status: 'invalidShape'; issues: readonly SectionIssue[] }>
  | Readonly<{ status: 'promotionFailed'; failure: ResourceFailure }>;

/**
 * Whether this editor may write: `pending` until the host has answered the
 * acquire, since a section a collaborator holds is indistinguishable from one
 * nobody holds while the answer is on its way, and an editable form the host
 * will refuse to take is a draft the researcher loses.
 *
 * `unavailable` is an acquire the host did not answer at all — the section was
 * deleted while this editor was opening it, or the transport dropped. There is
 * no retry: an editor that stayed `pending` would sit on an acquiring state
 * for ever, which is the one thing a researcher cannot act on.
 */
export type SectionAccess = 'pending' | 'editing' | 'readOnly' | 'unavailable';

export type SectionMutation = Readonly<{
  document: SectionDoc | undefined;
  revision: Revision | undefined;
  access: SectionAccess;
  holder: Presence | undefined;
  submit(
    document: SectionDoc,
    promote?: ResourcePromotion,
  ): Promise<SubmitResult>;
  release(): void;
}>;

/**
 * The section this component is editing.
 *
 * Takes the lock on mount and gives it back on unmount. There is no renewal
 * and no re-acquire: a submit the host refuses comes back as a
 * `notLockHolder` result for the editor to report, the draft is the editor's
 * to discard, and this editor is read-only from that moment on — it does not
 * hold the section any more, and nothing here is going to ask for it again.
 */
export function useSectionMutation(id: ProtocolSectionId): SectionMutation {
  const { client, protocolId, utils } = useProtocolBuilderContext();
  const queryClient = useQueryClient();
  const [access, setAccess] = useState<SectionAccess>('pending');
  // A fault the acquire's success handler threw, which is a bug in this hook
  // rather than anything the host did. Re-thrown from render below, where the
  // nearest error boundary takes it, because the alternative is telling the
  // researcher the section is unreachable and leaving the fault invisible.
  const [handlerFault, setHandlerFault] = useState<
    Readonly<{ error: unknown }> | undefined
  >(undefined);
  // Which acquire is this editor's. An acquire that settles after its own
  // effect has been cleaned up must not touch the lock, because the next
  // effect for the same section may already hold it.
  const acquisition = useRef(0);
  // The section the newest effect is for. An acquire that settles after the
  // editor moved on has to know whether the lock it was granted is one this
  // editor still wants.
  const wanted = useRef<ProtocolSectionId | undefined>(undefined);
  const released = useRef(false);
  // The id this editor's save carries while its answer is uncertain — see
  // `useKeptRequestId`. Asked for by the document, so a save of NEW work is
  // never answered with the revision the earlier one wrote, and a retry after
  // a dropped socket makes the host replay what the first attempt wrote
  // instead of writing again — or, for a promotion, refusing it because that
  // attempt already consumed the staged files.
  const saveKey = useKeptRequestId();
  const section = useSection(id);
  const { data: lock } = useQuery<LockState>({
    queryKey: lockQueryKey(protocolId, id),
    // Written by the channel's lock events and by the acquire below. No
    // procedure answers "who holds this", so this observer never fetches.
    queryFn: skipToken,
    initialData: {},
  });

  // Giving a lock back is best effort, which is why every one of them goes
  // through `safe`: a host that will not take it — the section has gone, the
  // socket dropped — leaves the editor nothing to do and the researcher nothing
  // to act on, and a bare promise would make it an unhandled rejection instead.
  useEffect(() => {
    const mine = (acquisition.current += 1);
    wanted.current = id;
    // The save an id was kept for was of the section this editor is leaving.
    saveKey.forget();
    // Nothing has been answered for this section yet, whatever the last one
    // this editor was pointed at said.
    setAccess('pending');
    void client.acquireLock({ protocolId, sectionId: id }).then(
      (result) => {
        if (acquisition.current !== mine) {
          // A later effect took over. When it is for this same section — a
          // StrictMode remount — the lock is that editor's and its own cleanup
          // is what releases it; handing it back here would take it away from
          // an editor that is using it. When it is for a DIFFERENT section, the
          // cleanup's release went out before the host granted this one, so
          // nothing else will ever give it back.
          if (wanted.current !== id && result.lock === 'held') {
            void safe(client.releaseLock({ protocolId, sectionId: id }));
          }
          return;
        }
        if (released.current) {
          // Acquired after unmount: hand it straight back rather than holding a
          // lock no editor is behind.
          void safe(client.releaseLock({ protocolId, sectionId: id }));
          return;
        }
        try {
          // Written only once this acquire is known to be the one this editor
          // is waiting for. A superseded answer is a document as it was before
          // the editor moved on, and this is a manual write: the channel may
          // have REMOVED that section — deleted while the acquire was in
          // flight — and a cache with nothing in it has no newer revision for
          // structural sharing to keep, so the deleted section would be put
          // back and, nothing here refetching, stay.
          //
          // For the acquire this editor is waiting for it is what the editor
          // has to start from: a cached document from before a revision this
          // client has not seen yet — the channel is reconnecting, say — would
          // be submitted back whole over the newer one.
          queryClient.setQueryData<SectionAtRevision>(
            utils.getSection.queryKey({ input: { protocolId, sectionId: id } }),
            { document: result.document, revision: result.revision },
          );
          setAccess(result.lock === 'readOnly' ? 'readOnly' : 'editing');
          if (result.lock === 'readOnly') {
            // The refusal already names the holder. Waiting for the channel to
            // say it again leaves a read-only editor unable to say whose
            // section it is — and a host whose locks are always granted never
            // says it at all.
            queryClient.setQueryData<LockState>(lockQueryKey(protocolId, id), {
              holder: result.holder,
            });
          }
        } catch (error: unknown) {
          setHandlerFault({ error });
        }
      },
      // The acquire's own rejection, as the second argument rather than a
      // `then` chained after the success handler: chained, it would also catch
      // an error the handler above threw and report a bug in this hook to the
      // researcher as a host that did not answer. Nothing here is retried, so
      // the editor is told; leaving it `pending` would sit on an acquiring
      // state for ever, and the rejection would go unhandled besides.
      () => {
        if (acquisition.current !== mine || released.current) return;
        setAccess('unavailable');
      },
    );
    released.current = false;
    return () => {
      released.current = true;
      void safe(client.releaseLock({ protocolId, sectionId: id }));
    };
  }, [client, protocolId, id, queryClient, saveKey, utils]);

  const submit = useCallback(
    async (
      document: SectionDoc,
      promote?: ResourcePromotion,
    ): Promise<SubmitResult> => {
      if (section === undefined) {
        throw new Error(`section ${id} was submitted before it was read`);
      }
      // One id for this save, reused while the same document is still being
      // saved, so an attempt whose answer was lost is replayed rather than
      // written again. Per save rather than per edit: the next save is a
      // different document, and an id shared with the last one would be
      // answered with the revision that one wrote.
      const requestId = saveKey.forAsk(contentHash(document));
      const { data, definedError, isSuccess } = await safe(
        client.submit({
          protocolId,
          requestId,
          sectionId: id,
          document,
          revision: section.revision,
          ...(promote === undefined ? {} : { promote }),
        }),
      );
      if (isSuccess || definedError !== null) saveKey.settled(requestId);
      if (isSuccess) {
        return {
          status: 'written',
          revision: data.revision,
          ...(data.promoted === undefined ? {} : { promoted: data.promoted }),
        };
      }
      if (definedError?.code === 'NOT_LOCK_HOLDER') {
        // The section is somebody else's now, and nothing here re-acquires it:
        // the editor above discards the draft it could not write, and this is
        // what stops the form it puts back from being editable. Left
        // `editing`, every later save is refused the same way and discards
        // another round of work — the same loss, over and over, with the
        // editor still saying it may write.
        setAccess('readOnly');
        // The refusal already names the holder, so the read-only editor can
        // say whose section it is without waiting for a lock event — and a
        // host whose locks are always granted never sends one.
        //
        // Naming NOBODY is an answer as well, and the cache has to take it:
        // that is a lease that ran out with no one taking the section, which
        // publishes no lock event at all (the acquire that TAKES one publishes
        // its own). What the cache still holds is this editor's own presence,
        // from the event its own acquire published — so left alone, the
        // read-only form it puts back tells the researcher that they are the
        // one editing the stage they have just been refused.
        queryClient.setQueryData<LockState>(
          lockQueryKey(protocolId, id),
          definedError.data.holder === undefined
            ? {}
            : { holder: definedError.data.holder },
        );
        return {
          status: 'notLockHolder',
          ...(definedError.data.holder === undefined
            ? {}
            : { holder: definedError.data.holder }),
        };
      }
      if (definedError?.code === 'SECTIONS_LOCKED') {
        return { status: 'sectionsLocked', blocked: definedError.data.blocked };
      }
      if (definedError?.code === 'INVALID_SHAPE') {
        return { status: 'invalidShape', issues: definedError.data.issues };
      }
      if (definedError?.code === 'PROMOTION_FAILED') {
        return {
          status: 'promotionFailed',
          failure: definedError.data.failure,
        };
      }
      throw definedError ?? new Error(`submit of ${id} failed`);
    },
    [client, protocolId, id, queryClient, saveKey, section],
  );

  const release = useCallback(() => {
    void safe(client.releaseLock({ protocolId, sectionId: id }));
  }, [client, protocolId, id]);

  if (handlerFault !== undefined) throw handlerFault.error;

  return {
    document: section?.document,
    revision: section?.revision,
    access,
    holder: lock?.holder,
    submit,
    release,
  };
}

function entityTypeSummary(
  id: ProtocolSectionId,
  document: SectionDoc,
): EntityTypeSummary {
  const ref = parseSectionId(id);
  const typeId =
    ref.kind === 'codebookNode' || ref.kind === 'codebookEdge'
      ? ref.typeId
      : id;
  const shape = document.shape;
  const defaultShape =
    shape !== null && typeof shape === 'object' && 'default' in shape
      ? shape.default
      : undefined;
  return {
    id: typeId,
    name: typeof document.name === 'string' ? document.name : typeId,
    ...(typeof document.color === 'string' ? { color: document.color } : {}),
    ...(typeof defaultShape === 'string' ? { shape: defaultShape } : {}),
  };
}

function stageSummary(id: string, document: SectionDoc): StageSummary {
  return {
    id,
    type: typeof document.type === 'string' ? document.type : '',
    label: typeof document.label === 'string' ? document.label : '',
  };
}

function stageIdsOf(document: SectionDoc): string[] {
  const stages = document.stages;
  return Array.isArray(stages)
    ? stages.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
