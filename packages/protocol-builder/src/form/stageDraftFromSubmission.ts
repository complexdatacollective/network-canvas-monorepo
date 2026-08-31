import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import {
  getValue,
  type ObjectPath,
  omitValue,
  setValue,
} from '@codaco/fresco-ui/form/utils/objectPath';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageFormDraft } from '../session.ts';

/**
 * A field the form no longer has mounted.
 *
 * Two kinds arrive here and they mean opposite things. One holds a value: the
 * researcher edited it and then something hid it — a collapsed group of
 * advanced options — and the edit is still theirs. The other holds nothing:
 * the capability that owned it was switched off, and the value was thrown
 * away on purpose.
 */
export type DormantField = Readonly<{
  name: string;
  /** The structural path the form store filed the value under. */
  path?: ObjectPath;
  value: FieldValue;
}>;

export type StageDraftSubmission = Readonly<{
  /** The draft as the session currently holds it. */
  currentFields: StageFormDraft;
  /** What the form handed the submit handler: mounted fields only. */
  submittedValues: Readonly<Record<string, FieldValue>>;
  dormantFields: readonly DormantField[];
}>;

/**
 * The stage draft a submit should produce.
 *
 * Four rules, applied in this order:
 *
 * 1. Keys the editor never rendered survive untouched. An interface with no
 *    section for `skipLogic` must not delete skip logic someone authored
 *    before switching interfaces.
 * 2. Fields the form still has mounted replace their top-level key outright.
 *    That is the unit the session turns into a command, and it is why a
 *    section owning part of a nested value has to render every part of it.
 * 3. A hidden field's value is written back where it belongs. Hiding a field
 *    is not a decision about its value.
 * 4. A discarded field is REMOVED rather than set to anything. Absence is how
 *    the protocol schema spells "this capability is off"; `null` is not a
 *    value it accepts anywhere.
 */
export function stageDraftFromSubmission(
  submission: StageDraftSubmission,
): SectionDoc {
  let draft: SectionDoc = {
    ...submission.currentFields,
    ...submission.submittedValues,
  };

  for (const dormant of submission.dormantFields) {
    const path = dormant.path ?? safeFieldPath(dormant.name);
    if (path === null || path.length === 0) continue;

    if (dormant.value === undefined) {
      draft = removePath(draft, path);
      continue;
    }
    // `setValue` copies every container it traverses, so this cannot write
    // through into the session's own frozen snapshot.
    setValue(draft, path, dormant.value);
  }

  return draft;
}

function safeFieldPath(name: string): ObjectPath | null {
  try {
    return resolveFieldPath([], name);
  } catch {
    // A name that cannot be resolved to a path addresses nothing in the
    // draft, so there is nothing for it to write or remove.
    return null;
  }
}

/**
 * Remove `path`, then remove any object it left empty.
 *
 * Removing the three parts of `skipLogic` has to remove `skipLogic` itself: a
 * `{}` left behind is not "no skip logic" to the schema, it is a skip logic
 * missing its required members. Only containers this removal emptied are
 * dropped — an object that was already empty is left exactly as the author
 * left it.
 */
function removePath(draft: SectionDoc, path: ObjectPath): SectionDoc {
  const removed = omitValue(draft, path);
  if (removed === draft) return draft;

  let next = removed as SectionDoc;
  for (let depth = path.length - 1; depth >= 1; depth -= 1) {
    const ancestorPath = path.slice(0, depth);
    if (!isEmptyDictionary(getValue(next, ancestorPath))) break;
    next = omitValue(next, ancestorPath) as SectionDoc;
  }
  return next;
}

/**
 * Arrays are excluded on purpose: `omitValue` leaves a hole rather than
 * renumbering an array's surviving entries, so an emptied array is not
 * evidence that the array itself should go.
 */
function isEmptyDictionary(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}
