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
import { stageDocument } from '../../stageDocument.ts';
import { collectStageResourceReferences } from '../references.ts';

/**
 * How many places in the stage being edited name a resource.
 *
 * Read from the form as it stands rather than from the document the stage was
 * opened on: the form reaches that document only at submit, so a resource a
 * sibling field picked a moment ago is not in it yet, and a control asking "is
 * anything else using this?" would be told no. The committed fields are
 * underneath, so a value the researcher has not touched still counts.
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
 * therefore added to the list its save will write it into
 * ({@link EditedRowContext}), through the same merge that save commits —
 * ALONGSIDE the row's committed copy rather than over it, because the
 * researcher can still cancel, and a reference a cancel restores is one the
 * stage can still have. See {@link withEditedRow}.
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
 * The draft with the row a dialog has open added to the list its save will
 * write it into, and every committed row left exactly where it is.
 *
 * ADDED rather than written over the row's own committed copy, because both
 * are references the stage can still come to have. The dialog's draft is what
 * a save leaves; the committed row is what a CANCEL leaves, and cancelling is
 * available for as long as the dialog is open. Written over, the count spoke
 * for one of those two futures only — so a panel that already named a staged
 * file could discard the bytes from its own dialog (the count saw a single
 * reference, its own), have the field cleared, and then restore the reference
 * by cancelling the row: a stage naming bytes the host has deleted, reached
 * through an action the researcher was told had worked. Counting both is the
 * question the discard actually asks — "if this field lets go, is anything
 * still naming it?" — and the answer that refuses is the one that cannot leave
 * a dangling reference. Nothing is lost by refusing: a staged resource no
 * field names is dropped as abandoned at finish anyway.
 *
 * It also removes the last use of the row's index, which could not be trusted.
 * The dialog outlives the row leaving the list — a collaborator removing it
 * leaves the draft on screen until the researcher answers for it — and the
 * index it was opened at then names whichever row shifted into that place.
 * Writing over it replaced a surviving row's references with this dialog's,
 * undercounting: the direction that deletes bytes something still names.
 */
function withEditedRow(
  draft: SectionDoc,
  editedRow: EditedRowScope | null,
): SectionDoc {
  if (editedRow === null) return draft;
  const path = [...editedRow.listPath];
  const held: unknown = getValue(draft, path);
  const rows = Array.isArray(held) ? [...(held as unknown[])] : [];
  rows.push(editedRow.read());
  // `setValue` copies every container it traverses, so this cannot write
  // through into the draft the submission assembled.
  const next: SectionDoc = { ...draft };
  setValue(next, path, rows);
  return next;
}
