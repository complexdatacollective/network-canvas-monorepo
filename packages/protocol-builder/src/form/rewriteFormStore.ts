import { isEqual } from 'es-toolkit';

import type {
  FieldState,
  FieldValue,
} from '@codaco/fresco-ui/form/store/types';
import {
  getValue,
  type ObjectPath,
  setValue,
} from '@codaco/fresco-ui/form/utils/objectPath';

import type { StageFormDraft } from '../stageDocument.ts';
import { safeFieldPath } from './documentFromSubmission.ts';
import { isFieldValue } from './fieldValue.ts';
import type { StageFormStoreApi } from './stageEditorContext.ts';

type StageRewrite = (fields: StageFormDraft) => StageFormDraft;

type HeldField = Readonly<{
  name: string;
  path: ObjectPath;
  field: FieldState;
}>;

/** Every field the form holds, mounted or parked, with where it lives. */
function heldFields(storeApi: StageFormStoreApi): HeldField[] {
  const { fields, dormantValues } = storeApi.getState();
  return [...fields, ...dormantValues].flatMap(([name, field]) => {
    const path = field.path ?? safeFieldPath(name);
    return path === null || path.length === 0 ? [] : [{ name, path, field }];
  });
}

/**
 * What `rewrite` makes of one field's value.
 *
 * The value is put back where it sits in the stage before it is rewritten,
 * because a rewrite reads the stage's shape to find what it changes. Each
 * field is rewritten on its own: a field registered at a container and another
 * registered inside it hold separate readings of the same place, and both
 * have to come out rewritten.
 */
function rewrittenAt(
  context: StageFormDraft,
  path: ObjectPath,
  value: FieldValue,
  rewrite: StageRewrite,
): FieldValue {
  const placed = { ...context };
  setValue(placed, path, value);
  const next = getValue(rewrite(placed), path);
  if (!isFieldValue(next)) {
    throw new TypeError('A stage rewrite left a value a form cannot hold.');
  }
  return next;
}

/**
 * Carries `rewrite` into what every field holds and into the baseline its
 * unsaved-change check is measured against, so a field the researcher had not
 * touched is still untouched afterwards and one they had edited keeps the edit,
 * rewritten.
 *
 * `live` is the stage as the form holds it now, which gives each field the
 * surroundings `rewrite` reads.
 */
export function rewriteFormStore(
  storeApi: StageFormStoreApi,
  live: StageFormDraft,
  rewrite: StageRewrite,
): void {
  const held = heldFields(storeApi);
  const baselines = held.map(({ path, field }) => ({
    path,
    before: field.initialValue,
    after: rewrittenAt(live, path, field.initialValue, rewrite),
  }));

  for (const { name, path, field } of held) {
    const next = rewrittenAt(live, path, field.value, rewrite);
    if (!isEqual(next, field.value)) {
      storeApi.getState().setFieldValue(name, next);
    }
  }

  if (baselines.every(({ before, after }) => isEqual(before, after))) return;

  // The store moves baselines only by reading them out of a document, so every
  // field's new baseline is written into one. Shallowest first, as a submit
  // assembles the fields, so a field inside a container reads its own baseline.
  const document: Record<string, unknown> = {};
  for (const { path, after } of baselines.toSorted(
    (a, b) => a.path.length - b.path.length,
  )) {
    setValue(document, path, after);
  }
  storeApi.getState().rebaseToDocument(document);
}
