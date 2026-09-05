import { useCallback, useContext } from 'react';

import { StageEditorFormContext } from '../../form/stageEditorContext.ts';
import { stageDocument } from '../../session.ts';
import { collectStageResourceReferences } from '../references.ts';

/**
 * How many places in the stage being edited name a resource.
 *
 * Read from the form as it stands rather than from the session's draft: the
 * form reaches the session on submit, so a resource a sibling field picked a
 * moment ago is not in the draft yet, and a control asking "is anything else
 * using this?" would be told no. Committed fields are underneath, so a value
 * the researcher has not touched still counts.
 *
 * The references are discovered through the protocol schema's own
 * `assetReference` tags rather than by scanning values, so a stage type gains
 * coverage as soon as its schema is tagged. Two consequences follow: a field
 * whose name is not a path in the stage document is not counted — nothing in
 * the protocol would reference it either — and neither is one that is not
 * mounted and whose value the form has replaced at the same top-level key.
 * Both under-count, which leaves the existing behaviour rather than refusing
 * an operation on a reference nobody can see.
 *
 * Zero outside a stage editor: the control is usable on its own, and on its
 * own there is no draft to consult.
 */
export function useStageResourceUsage(): (resourceId: string) => number {
  const form = useContext(StageEditorFormContext);
  const storeApi = form?.storeApi;
  const identity = form?.identity;
  const committedFields = form?.committedFields;

  return useCallback(
    (resourceId: string): number => {
      if (storeApi === undefined || identity === undefined) return 0;
      const draft = stageDocument(identity, {
        ...committedFields,
        ...storeApi.getState().getFormValues(),
      });
      return collectStageResourceReferences(draft).filter(
        (reference) => reference.resourceId === resourceId,
      ).length;
    },
    [committedFields, identity, storeApi],
  );
}
