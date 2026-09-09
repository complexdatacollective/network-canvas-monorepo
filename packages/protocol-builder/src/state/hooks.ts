import { safe } from '@orpc/client';
import {
  skipToken,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { z } from 'zod';

import type { SectionDoc } from '@codaco/studio-sync/apply';
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
 */
export type SectionAccess = 'pending' | 'editing' | 'readOnly';

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
 * `notLockHolder` result for the editor to report, and the draft is the
 * editor's to discard.
 */
export function useSectionMutation(id: ProtocolSectionId): SectionMutation {
  const { client, protocolId, utils } = useProtocolBuilderContext();
  const queryClient = useQueryClient();
  const [access, setAccess] = useState<SectionAccess>('pending');
  // Which acquire is this editor's. An acquire that settles after its own
  // effect has been cleaned up must not touch the lock, because the next
  // effect for the same section may already hold it.
  const acquisition = useRef(0);
  const released = useRef(false);
  const section = useSection(id);
  const { data: lock } = useQuery<LockState>({
    queryKey: lockQueryKey(protocolId, id),
    // Written by the channel's lock events and by the acquire below. No
    // procedure answers "who holds this", so this observer never fetches.
    queryFn: skipToken,
    initialData: {},
  });

  useEffect(() => {
    const mine = (acquisition.current += 1);
    // Nothing has been answered for this section yet, whatever the last one
    // this editor was pointed at said.
    setAccess('pending');
    void client.acquireLock({ protocolId, sectionId: id }).then((result) => {
      // The acquire answers with the section as the host holds it now, which
      // is what this editor has to start from: a cached document from before
      // a revision this client has not seen yet — the channel is reconnecting,
      // say — would be submitted back whole over the newer one.
      queryClient.setQueryData<SectionAtRevision>(
        utils.getSection.queryKey({ input: { protocolId, sectionId: id } }),
        { document: result.document, revision: result.revision },
      );
      if (acquisition.current !== mine) {
        // A later mount of this section owns the lock now. Locks are held by
        // the session, so handing this one back would take that editor's:
        // its own cleanup is what releases it.
        return;
      }
      if (released.current) {
        // Acquired after unmount: hand it straight back rather than holding a
        // lock no editor is behind.
        void client.releaseLock({ protocolId, sectionId: id });
        return;
      }
      setAccess(result.lock === 'readOnly' ? 'readOnly' : 'editing');
      if (result.lock === 'readOnly') {
        // The refusal already names the holder. Waiting for the channel to say
        // it again leaves a read-only editor unable to say whose section it is
        // — and a host whose locks are always granted never says it at all.
        queryClient.setQueryData<LockState>(lockQueryKey(protocolId, id), {
          holder: result.holder,
        });
      }
    });
    released.current = false;
    return () => {
      released.current = true;
      void client.releaseLock({ protocolId, sectionId: id });
    };
  }, [client, protocolId, id, queryClient, utils]);

  const submit = useCallback(
    async (
      document: SectionDoc,
      promote?: ResourcePromotion,
    ): Promise<SubmitResult> => {
      if (section === undefined) {
        throw new Error(`section ${id} was submitted before it was read`);
      }
      const { data, definedError, isSuccess } = await safe(
        client.submit({
          protocolId,
          sectionId: id,
          document,
          revision: section.revision,
          ...(promote === undefined ? {} : { promote }),
        }),
      );
      if (isSuccess) {
        return {
          status: 'written',
          revision: data.revision,
          ...(data.promoted === undefined ? {} : { promoted: data.promoted }),
        };
      }
      if (definedError?.code === 'NOT_LOCK_HOLDER') {
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
    [client, protocolId, id, section],
  );

  const release = useCallback(() => {
    void client.releaseLock({ protocolId, sectionId: id });
  }, [client, protocolId, id]);

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
  return {
    id: typeId,
    name: typeof document.name === 'string' ? document.name : typeId,
    ...(typeof document.color === 'string' ? { color: document.color } : {}),
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
