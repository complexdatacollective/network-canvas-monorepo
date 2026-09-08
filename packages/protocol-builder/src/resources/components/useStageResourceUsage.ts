import { useCallback, useContext } from 'react';

import { getValue, setValue } from '@codaco/fresco-ui/form/utils/objectPath';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  EditedRowContext,
  type EditedRowScope,
} from '../../form/arrayFields/editedRow.ts';
import {
  dormantFieldsOf,
  mountedPathsOf,
  stageDraftFromSubmission,
} from '../../form/stageDraftFromSubmission.ts';
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
 * **Counted over the draft the submit would produce, not over the values the
 * form is showing.** A field hidden behind a collapsed group or a switched-off
 * capability keeps its value, and the submit writes it back — so a reference
 * parked in one is a reference the saved stage really has. Counting only
 * mounted fields would let a visible picker discard bytes the very next submit
 * goes on to name, which is a dangling reference nothing can then repair. So
 * the count asks {@link stageDraftFromSubmission} exactly what the submit
 * asks it, and it is the same answer.
 *
 * The references are discovered through the protocol schema's own
 * `assetReference` tags rather than by scanning values, so a stage type gains
 * coverage as soon as its schema is tagged. One consequence follows: a field
 * whose name is not a path in the stage document is not counted — nothing in
 * the protocol would reference it either. That under-counts, which leaves the
 * existing behaviour rather than refusing an operation on a reference nobody
 * can see.
 *
 * **A row dialog's own draft counts too.** A control inside one belongs to the
 * dialog's form store, and the row reaches the stage form only when the dialog
 * saves — so the stage form alone describes a stage that still holds the row's
 * PREVIOUS values, or no such row at all. Counting that answers the wrong
 * question twice over: the field asking is not in the count, so its own
 * reference is missing and a lone reference held by a SIBLING row reads as
 * "only this field uses it" — which let a picker in a second panel's dialog
 * discard bytes the first panel still names. The row a dialog has open is
 * therefore written where its save will write it
 * ({@link EditedRowContext}), through the same merge that save commits.
 *
 * Zero outside a stage editor: the control is usable on its own, and on its
 * own there is no draft to consult.
 */
export function useStageResourceUsage(): (resourceId: string) => number {
  const form = useContext(StageEditorFormContext);
  const editedRow = useContext(EditedRowContext);
  const storeApi = form?.storeApi;
  const identity = form?.identity;
  const committedFields = form?.committedFields;

  return useCallback(
    (resourceId: string): number => {
      if (storeApi === undefined || identity === undefined) return 0;
      const draft = stageDocument(
        identity,
        withEditedRow(
          stageDraftFromSubmission({
            currentFields: committedFields ?? {},
            submittedValues: storeApi.getState().getFormValues(),
            mountedPaths: mountedPathsOf(storeApi),
            dormantFields: dormantFieldsOf(storeApi),
          }),
          editedRow,
        ),
      );
      return collectStageResourceReferences(draft).filter(
        (reference) => reference.resourceId === resourceId,
      ).length;
    },
    [committedFields, editedRow, identity, storeApi],
  );
}

/**
 * The draft with the row a dialog has open written where its save will put it.
 *
 * Appended rather than replaced when the list has no such position: a new row
 * is not in the list yet, and a row whose index the list has since lost left it
 * while the dialog stayed open. Both are rows the researcher can still save,
 * and a reference either of them carries is one the stage can still come to
 * have — so both are counted rather than dropped.
 */
function withEditedRow(
  draft: SectionDoc,
  editedRow: EditedRowScope | null,
): SectionDoc {
  if (editedRow === null) return draft;
  const path = [...editedRow.listPath];
  const held: unknown = getValue(draft, path);
  const rows = Array.isArray(held) ? [...(held as unknown[])] : [];
  const { index } = editedRow;
  if (index === undefined || index < 0 || index >= rows.length) {
    rows.push(editedRow.read());
  } else {
    rows[index] = editedRow.read();
  }
  // `setValue` copies every container it traverses, so this cannot write
  // through into the draft the submission assembled.
  const next: SectionDoc = { ...draft };
  setValue(next, path, rows);
  return next;
}
