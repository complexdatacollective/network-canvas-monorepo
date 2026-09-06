import { isEqual } from 'es-toolkit/compat';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import {
  getValue,
  type ObjectPath,
} from '@codaco/fresco-ui/form/utils/objectPath';

import type { StageFormDraft } from '../session.ts';
import type { StageFormStoreApi } from './stageEditorContext.ts';

/**
 * Whether the form store can hold this.
 *
 * A container's CONTENTS are not inspected, arrays included. fresco-ui's own
 * render-tolerance contract (`useField`'s `fieldProps.value`, and the
 * `fieldValueContract` suite that holds every control to it) says a connected
 * control is handed the stored value verbatim and must render any shape of it
 * without throwing — so refusing a list because of one entry inside it would
 * create a crash exactly where that contract promises there is none.
 */
const isFieldValue = (value: unknown): value is FieldValue =>
  value === undefined ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  (typeof value === 'object' && value !== null);

/**
 * The draft's value at a path, as something the form can hold.
 *
 * `null` is not in `FieldValue`'s union, but stored protocol data holds it —
 * fresco-ui's `fieldValueContract` names it as a shape every control must
 * render — so a reseed cannot be the one place that throws on it. It means
 * here what it means everywhere else in this package: nothing is there. It is
 * written as `undefined`, the absent value, and never as `null`.
 *
 * Anything else outside the union is an invariant violation, and stays visible
 * rather than being silently replaced by a cleared field.
 */
const requireFieldValue = (value: unknown): FieldValue => {
  if (value === null) return undefined;
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
 * Writes what an arrival DECIDED into the controls that are already on screen.
 *
 * This is what a stage editor does instead of rebuilding itself when the draft
 * moves for a reason that is not its own submit — an undo, a redo, an
 * acknowledgement, an authoritative replacement, a rollback after a lost lease.
 * Rebuilding is the obvious alternative and is what this replaces: it discards
 * everything typed but not yet saved, and it destroys any row dialog open over
 * the editor, along with the draft inside it and the message the save was about
 * to report.
 *
 * `previous` is the agreed draft the controls were already level with, and it
 * is what `next` is compared against — never the values on screen. That
 * comparison is the whole rule:
 *
 *   a key is written only where the AGREED draft moved at it. A key the
 *   arrival left exactly as it found it is the researcher's, however far the
 *   control has since been typed away from it.
 *
 * Comparing against the screen instead answers a different question. Typing
 * never reaches the session, so every half-finished field differs from the
 * agreed draft by definition; an undo of a list edit, an acknowledgement of
 * some other key, a collaborator renaming a prompt — each of them replaces the
 * whole draft, and each would then write the pre-typing value back over every
 * field the researcher had touched, for a change that was about none of them.
 * That is the same leaf-level "only what the edit decided" rule this package
 * applies to a row being replaced (`reseatEditedRow`), asked here of the
 * arrival rather than of the edit.
 *
 * A key the arrival DID move is written whatever the control holds, including
 * one the researcher is typing in at that moment: two answers to the same key
 * cannot both stand, and the agreed one is the one the next save writes.
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
  previous: StageFormDraft,
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
    // Asked of the two agreed drafts at the field's OWN path, which is the
    // finest grain the form can be written at: a control owning a container
    // (`settings`) is written when anything inside it moved, and one owning a
    // leaf inside a container (`skipLogic.action`) is left alone when only its
    // sibling did.
    const arrived = getValue(next, path);
    if (isEqual(getValue(previous, path), arrived)) continue;
    const target = requireFieldValue(arrived);
    if (isEqual(field.value, target)) continue;
    write(name, path, target);
  }

  state.notifyRestore();
}
