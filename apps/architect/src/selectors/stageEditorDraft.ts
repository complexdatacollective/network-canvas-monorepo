import { isEqual, omit } from 'es-toolkit/compat';
import { getFormValues } from 'redux-form';

import type { RootState } from '~/ducks/modules/root';

export const getCanUndoDraft = (state: RootState): boolean =>
  (state.stageEditorDraft.history.past?.length ?? 0) > 0;

export const getCanRedoDraft = (state: RootState): boolean =>
  (state.stageEditorDraft.history.future?.length ?? 0) > 0;

export const getDraftRestoring = (state: RootState): boolean =>
  state.stageEditorDraft.ui.restoring;

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
 * Dirty state for the fresco-ui stage form, derived from the live mirror the
 * stage form bridge maintains rather than from redux-form's values.
 *
 * Deliberately a deep comparison against the committed baseline (not
 * fresco-ui's sticky `isDirty`), so undoing back to the committed values
 * reports clean again.
 */
export const getLiveStageDraftDirty = (state: RootState): boolean => {
  const { initialValues, liveValues, externalEditCount } =
    state.stageEditorDraft.ui;

  // Until the baseline is seeded, comparing populated values against {} would
  // report dirty spuriously and flash the "Finished Editing" button on entry.
  if (initialValues == null) return false;

  // Edits made outside the form (codebook writes) have no representation in
  // the form values, so they are tracked separately.
  if (externalEditCount > 0) return true;

  if (liveValues == null) return false;

  return !isEqual(pruneEmpty(liveValues), pruneEmpty(initialValues));
};

export const getStageDraftDirty = (state: RootState): boolean => {
  // Until the baseline is seeded, comparing populated values against {} would
  // report dirty spuriously and flash the "Finished Editing" button on entry.
  if (state.stageEditorDraft.ui.initialValues == null) return false;

  const current = omit(
    (getFormValues('edit-stage')(state) ?? {}) as Record<string, unknown>,
    ['_modified'],
  );
  const initial = omit(
    (state.stageEditorDraft.ui.initialValues ?? {}) as Record<string, unknown>,
    ['_modified'],
  );

  return !isEqual(current, initial);
};
