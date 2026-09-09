import { safe } from '@orpc/client';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import type { z } from 'zod';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import {
  parseSectionId,
  sectionId,
  type ProtocolSectionId,
} from '@codaco/studio-sync/taxonomy';

import type {
  Presence,
  Revision,
  SectionIssueSchema,
} from '../contract/schemas.ts';
import {
  acquireQueryKey,
  lockQueryKey,
  useProtocolBuilderContext,
  type LockState,
} from './context.ts';

export type SectionAtRevision = Readonly<{
  document: SectionDoc;
  revision: Revision;
}>;

export type SectionIssue = z.output<typeof SectionIssueSchema>;

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
  | Readonly<{ status: 'written'; revision: Revision }>
  | Readonly<{ status: 'notLockHolder'; holder?: Presence }>
  | Readonly<{ status: 'invalidShape'; issues: readonly SectionIssue[] }>;

export type SectionMutation = Readonly<{
  document: SectionDoc | undefined;
  revision: Revision | undefined;
  /**
   * `pending` until the host has answered the acquire. An editor must not draw
   * an editable form over it: the answer decides whether this caller may write
   * at all, and a form that opened editable and turned read-only a tick later
   * has already invited an edit it cannot keep.
   */
  lock: 'pending' | 'held' | 'readOnly';
  readOnly: boolean;
  holder: Presence | undefined;
  submit(document: SectionDoc): Promise<SubmitResult>;
}>;

/**
 * The section this component is editing.
 *
 * Takes the lock on mount and gives it back on unmount. The acquire is also
 * the read: it answers with the document at the revision the lock was taken
 * at, which is the document the editor then owns for as long as it holds it.
 *
 * There is no renewal and no re-acquire: a submit the host refuses comes back
 * as a `notLockHolder` result for the editor to report, and the draft is the
 * editor's to discard.
 */
export function useSectionMutation(id: ProtocolSectionId): SectionMutation {
  const { client, protocolId } = useProtocolBuilderContext();
  const { data: acquired } = useQuery({
    queryKey: acquireQueryKey(protocolId, id),
    queryFn: () => client.acquireLock({ protocolId, sectionId: id }),
    staleTime: Number.POSITIVE_INFINITY,
    // Dropped the moment the last editor unmounts, because the lock goes back
    // with it: a cached answer served to the next editor would hand it a
    // document under a lock nobody holds, and its first save would be refused.
    gcTime: 0,
  });
  const { data: lockState } = useQuery<LockState>({
    queryKey: lockQueryKey(protocolId, id),
    queryFn: () => ({}),
  });

  useEffect(
    () => () => {
      void client.releaseLock({ protocolId, sectionId: id });
    },
    [client, protocolId, id],
  );

  const revision = acquired?.revision;
  const submit = useCallback(
    async (document: SectionDoc): Promise<SubmitResult> => {
      if (revision === undefined) {
        throw new Error(`section ${id} was submitted before it was read`);
      }
      const { data, definedError, isSuccess } = await safe(
        client.submit({ protocolId, sectionId: id, document, revision }),
      );
      if (isSuccess) return { status: 'written', revision: data.revision };
      if (definedError?.code === 'NOT_LOCK_HOLDER') {
        return {
          status: 'notLockHolder',
          ...(definedError.data.holder === undefined
            ? {}
            : { holder: definedError.data.holder }),
        };
      }
      if (definedError?.code === 'INVALID_SHAPE') {
        return { status: 'invalidShape', issues: definedError.data.issues };
      }
      throw definedError ?? new Error(`submit of ${id} failed`);
    },
    [client, protocolId, id, revision],
  );

  return {
    document: acquired?.document,
    revision,
    lock: acquired?.lock ?? 'pending',
    readOnly: acquired?.lock === 'readOnly',
    // The acquire's own answer first: an editor that opened read-only has
    // already been told who by, and has nothing to wait on the channel for.
    holder: acquired?.lock === 'readOnly' ? acquired.holder : lockState?.holder,
    submit,
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
