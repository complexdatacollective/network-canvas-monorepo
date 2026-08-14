import { isEqual } from 'es-toolkit/compat';

import type { FieldState } from '@codaco/fresco-ui/form/store/types';

/**
 * Values that mean "nothing here". A field registered without an
 * `initialValue` holds `undefined`; typing into it and then clearing it leaves
 * `''` (or `[]`). Those are the same state to the person editing, so treating
 * them as different would report a form dirty after an edit was undone.
 */
const isBlank = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

const hasChanged = (field: FieldState): boolean => {
  if (isBlank(field.value) && isBlank(field.initialValue)) return false;
  return !isEqual(field.value, field.initialValue);
};

type DirtyReadableStore = {
  getState: () => {
    fields: Map<string, FieldState>;
    dormantValues: Map<string, FieldState>;
  };
};

/**
 * Whether a form store currently holds values that differ from the ones its
 * fields registered with.
 *
 * Deliberately a live comparison rather than the store's own `isDirty` flag.
 * That flag is sticky — `setFieldValue` sets it and only `reset` clears it, so
 * it never returns to false once anything has been typed. Guarding on it would
 * nag about a form the researcher had already restored by hand, and any
 * normalisation write at mount (a markdown-to-rich-text conversion, an option
 * editor opening itself) would make a freshly opened editor claim to be dirty
 * immediately. The stage editor's own guard rejected the sticky flag for the
 * same reason — see `getLiveStageDraftDirty`.
 *
 * `dormantValues` is included because a field that unmounts (a section that
 * collapsed, a branch that stopped rendering) parks its value there; an edit
 * made before it unmounted is still an unsaved edit.
 */
export const isFormStoreDirty = (store: DirtyReadableStore): boolean => {
  const { fields, dormantValues } = store.getState();

  for (const field of fields.values()) {
    if (hasChanged(field)) return true;
  }
  for (const field of dormantValues.values()) {
    if (hasChanged(field)) return true;
  }

  return false;
};
