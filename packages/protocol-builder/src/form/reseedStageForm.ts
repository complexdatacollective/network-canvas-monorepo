import { isEqual } from 'es-toolkit/compat';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import {
  getValue,
  type ObjectPath,
} from '@codaco/fresco-ui/form/utils/objectPath';

import type { StageFormDraft } from '../session.ts';
import type { StageFormStoreApi } from './stageEditorContext.ts';

const isFieldValueArrayItem = (
  value: unknown,
): value is string | number | boolean | Record<string, unknown> =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

const isFieldValue = (value: unknown): value is FieldValue =>
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (Array.isArray(value) && value.every(isFieldValueArrayItem)) ||
  (typeof value === 'object' && value !== null && !Array.isArray(value));

/**
 * Narrows a value read out of the stage draft by path without weakening the
 * form store's contract. A draft holding something the form cannot store is an
 * invariant violation, and must stay visible rather than being silently
 * replaced by a cleared field.
 */
const requireFieldValue = (value: unknown): FieldValue => {
  if (!isFieldValue(value)) {
    throw new TypeError('Stage draft values must satisfy the form contract.');
  }
  return value;
};

function safeFieldPath(name: string): ObjectPath | null {
  try {
    return resolveFieldPath([], name);
  } catch {
    // A name that resolves to no path addresses nothing in the draft, so there
    // is nothing to re-seed it from.
    return null;
  }
}

/**
 * Writes an authoritative draft into the controls that are already on screen.
 *
 * This is what a stage editor does instead of rebuilding itself when the draft
 * moves for a reason that is not its own submit — an undo, a redo, an
 * acknowledgement, an authoritative replacement, a rollback after a lost lease.
 * Rebuilding is the obvious alternative and is what this replaces: it discards
 * everything typed but not yet saved, and it destroys any row dialog open over
 * the editor, along with the draft inside it and the message the save was about
 * to report.
 *
 * Two kinds of holder are written, because a value the editor is showing can be
 * in either:
 *
 * 1. a MOUNTED field, written at the path it registered under;
 * 2. a DORMANT field — one that has been mounted at some point and is currently
 *    hidden behind a collapsed group, or emptied by a capability that was
 *    switched off — written into dormant storage, where the field picks it up
 *    when it remounts.
 *
 * A key NO field speaks for is deliberately not written. The submit assembles
 * its draft from what the SESSION holds rather than from the form's values, so
 * a key the editor never rendered is already right, and a capability deciding
 * whether it is switched on falls through to the same committed draft when
 * nothing in the form knows about its path.
 *
 * `notifyRestore` is the last step rather than an optional extra: it is the
 * form-owned signal Fresco's `Section` watches to reapply `defaultOpen`, and
 * without it a capability an arrival has just refilled stays closed over the
 * content the next save will write.
 *
 * Architect's own stage editor already restores its timeline this way
 * (`useStageDraftHistory`'s `applyDiff` plus `StageFormBridge`'s
 * `runRestore`). The package cannot import from an app, so the mechanism lives
 * here — addressed structurally rather than by field name, because a stage key
 * may be protocol-authored and contain a dot or a space.
 */
export function reseedStageForm(
  storeApi: StageFormStoreApi,
  next: StageFormDraft,
): void {
  const state = storeApi.getState();
  const { pathOperations } = state;

  // The same fallback `useClearStageValue` keeps, for the same reason: the
  // structural api is optional on the type, and the string one addresses a
  // name containing a dot as a route through the document rather than as the
  // protocol-authored key it is. It is the lesser wrong, not a second route.
  const write = (name: string, path: ObjectPath, value: FieldValue) => {
    if (pathOperations === undefined) {
      state.setFieldValue(name, value);
      return;
    }
    pathOperations.setFieldValue(path, value);
  };

  // Snapshotted first: every write below replaces the maps being read.
  const known = [...state.fields, ...state.dormantValues].map(
    ([name, field]) => ({ name, field }),
  );

  for (const { name, field } of known) {
    const path = field.path ?? safeFieldPath(name);
    if (path === null || path.length === 0) continue;
    const target = requireFieldValue(getValue(next, path));
    if (isEqual(field.value, target)) continue;
    write(name, path, target);
  }

  state.notifyRestore();
}
