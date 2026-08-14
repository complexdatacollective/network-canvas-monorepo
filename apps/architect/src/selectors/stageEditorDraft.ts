import { createSelector } from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit/compat';

import type { Codebook } from '@codaco/protocol-validation';
import type { RootState } from '~/ducks/modules/root';

export const getCanUndoDraft = (state: RootState): boolean =>
  (state.stageEditorDraft.history.past?.length ?? 0) > 0;

export const getCanRedoDraft = (state: RootState): boolean =>
  (state.stageEditorDraft.history.future?.length ?? 0) > 0;

/**
 * The stage editor's working copy of the codebook, or null when no editor is
 * open. `selectors/protocol` overlays it so the whole UI reads it.
 */
export const getStageEditorDraftCodebook = (
  state: RootState,
): Codebook | null =>
  // Optional-chained deliberately. `getProtocol` derives from this, and it is
  // read by unit tests whose stores register only the slices under test — a
  // cross-slice read there must resolve to "no transaction", not throw.
  state.stageEditorDraft?.history?.present?.codebook ?? null;

/**
 * Whether codebook writes must be routed to the stage editor's draft.
 *
 * Keyed on the seeded baseline rather than on the working copy: the baseline is
 * written once when the editor opens and cleared once when it closes, so it
 * cannot be confused by an undo that rewinds the working copy to null.
 */
export const getStageEditorCodebookTransactionOpen = (
  state: RootState,
): boolean => (state.stageEditorDraft?.ui?.initialCodebook ?? null) !== null;

// The mirror only holds values for fields that are currently registered, so a
// collapsed section contributes nothing while the baseline it is compared
// against holds the whole committed stage. Dropping `undefined` leaves (and the
// empty containers left behind) from both sides makes "a field is mounted but
// empty" indistinguishable from "the field is not mounted", which is what the
// user means by "unchanged". Clearing a field that had a committed value still
// reads as dirty: the key survives on the baseline side only.
const pruneEmpty = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(pruneEmpty);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) continue;
    const pruned = pruneEmpty(entry);
    if (
      pruned !== null &&
      typeof pruned === 'object' &&
      !Array.isArray(pruned) &&
      Object.keys(pruned).length === 0
    ) {
      continue;
    }
    result[key] = pruned;
  }
  return result;
};

/**
 * Dirty state for the stage form, derived from the live mirror the stage form
 * bridge maintains.
 *
 * Deliberately a deep comparison against the committed baseline (not
 * fresco-ui's sticky `isDirty`), so undoing back to the committed values
 * reports clean again.
 */
export const getLiveStageDraftDirty = createSelector(
  [
    (state: RootState) => state.stageEditorDraft.ui.initialValues,
    (state: RootState) => state.stageEditorDraft.ui.liveValues,
    (state: RootState) => state.stageEditorDraft.ui.initialCodebook,
    getStageEditorDraftCodebook,
  ],
  (initialValues, liveValues, initialCodebook, draftCodebook): boolean => {
    // Until the baseline is seeded, comparing populated values against {}
    // would report dirty spuriously and flash the "Finished Editing" button on
    // entry.
    if (initialValues == null) return false;

    // Codebook edits (a renamed variable, a swapped input control, a new
    // variable) have no representation in the stage's form values, so they are
    // compared directly against the codebook the editor opened on. A deep
    // comparison rather than a counter, so undoing back to the opening state
    // reports clean again — and so no future codebook call site can make the
    // editor silently non-dirty by forgetting to announce itself.
    if (
      initialCodebook !== null &&
      draftCodebook !== null &&
      draftCodebook !== initialCodebook &&
      !isEqual(draftCodebook, initialCodebook)
    ) {
      return true;
    }

    if (liveValues == null) return false;

    return !isEqual(pruneEmpty(liveValues), pruneEmpty(initialValues));
  },
);
