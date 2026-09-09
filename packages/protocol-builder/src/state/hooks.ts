import { safe } from '@orpc/client';
import {
  skipToken,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
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
  readOnly: boolean;
  holder: Presence | undefined;
  submit(document: SectionDoc): Promise<SubmitResult>;
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
  const { client, protocolId } = useProtocolBuilderContext();
  const queryClient = useQueryClient();
  const [readOnly, setReadOnly] = useState(false);
  const section = useSection(id);
  const { data: lock } = useQuery<LockState>({
    queryKey: lockQueryKey(protocolId, id),
    // Written by the channel's lock events and by the acquire below. No
    // procedure answers "who holds this", so this observer never fetches.
    queryFn: skipToken,
    initialData: {},
  });

  useEffect(() => {
    let mounted = true;
    void client.acquireLock({ protocolId, sectionId: id }).then((result) => {
      if (!mounted) {
        // Acquired after unmount: hand it straight back rather than holding a
        // lock no editor is behind.
        void client.releaseLock({ protocolId, sectionId: id });
        return;
      }
      setReadOnly(result.lock === 'readOnly');
      if (result.lock === 'readOnly') {
        // The refusal already names the holder. Waiting for the channel to say
        // it again leaves a read-only editor unable to say whose section it is
        // — and a host whose locks are always granted never says it at all.
        queryClient.setQueryData<LockState>(lockQueryKey(protocolId, id), {
          holder: result.holder,
        });
      }
    });
    return () => {
      mounted = false;
      void client.releaseLock({ protocolId, sectionId: id });
    };
  }, [client, protocolId, id, queryClient]);

  const submit = useCallback(
    async (document: SectionDoc): Promise<SubmitResult> => {
      if (section === undefined) {
        throw new Error(`section ${id} was submitted before it was read`);
      }
      const { data, definedError, isSuccess } = await safe(
        client.submit({
          protocolId,
          sectionId: id,
          document,
          revision: section.revision,
        }),
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
    [client, protocolId, id, section],
  );

  const release = useCallback(() => {
    void client.releaseLock({ protocolId, sectionId: id });
  }, [client, protocolId, id]);

  return {
    document: section?.document,
    revision: section?.revision,
    readOnly,
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
