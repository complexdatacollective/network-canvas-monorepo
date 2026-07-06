import { isEqual, omit } from 'es-toolkit/compat';
import { getFormValues } from 'redux-form';

import type { RootState } from '~/ducks/modules/root';

export const getCanUndoDraft = (state: RootState): boolean =>
  (state.stageEditorDraft.history.past?.length ?? 0) > 0;

export const getCanRedoDraft = (state: RootState): boolean =>
  (state.stageEditorDraft.history.future?.length ?? 0) > 0;

export const getDraftRestoring = (state: RootState): boolean =>
  state.stageEditorDraft.ui.restoring;

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
