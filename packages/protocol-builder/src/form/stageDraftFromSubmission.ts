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
  /** Where the still-mounted fields live, so a hidden one cannot outrank them. */
  mountedPaths: readonly ObjectPath[];
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

  const { writes, removals } = partitionDormant(submission.dormantFields);

  // A hidden CONTAINER is dropped outright when the form still has a field
  // mounted inside it: the submitted values already carry that field's current
  // edit, and replaying the container the researcher last saw would put the
  // stale reading of a field they can still see back over it.
  const applicable = writes.filter(
    (write) => !hasDescendantIn(submission.mountedPaths, write.path),
  );

  // Shallowest first, so a field registered at a container path cannot
  // overwrite the edit made to a field registered inside it. Fresco's own
  // assembly of mounted fields replays them in exactly this order, and the
  // two have to agree or collapsing a section would restore a stale nested
  // value that the mounted form had already replaced.
  for (const write of applicable.toSorted(
    (a, b) => a.path.length - b.path.length,
  )) {
    // `setValue` copies every container it traverses, so this cannot write
    // through into the session's own frozen snapshot.
    setValue(draft, write.path, write.value);
  }

  // After the writes, never before them: a capability switched off removes
  // the paths it owns, and a field parked inside it must not be written back
  // afterwards.
  //
  // Filtered the same way the writes are, and for the same reason. A
  // capability switched off and then reopened before saving still has the
  // tombstone its switch-off left at the container path, while its controls
  // are back on screen holding what the researcher has since typed. Removing
  // the container then would throw away values they are looking at.
  //
  // "Beneath it" covers the parked writes as well as the mounted fields. A
  // capability switched off, reopened, edited, and hidden again leaves the
  // switch-off's tombstone at the container while the values entered since sit
  // dormant inside it — and those values are the newer knowledge. A switch-off
  // that came AFTER them cannot be in this position, because clearing a
  // capability empties everything beneath it too.
  const livePaths = [
    ...submission.mountedPaths,
    ...applicable.map((write) => write.path),
  ];
  for (const removal of removals) {
    if (hasDescendantIn(livePaths, removal.path)) continue;
    // The same protection from above, but only from a control the researcher
    // can currently see. A capability path re-entered through a compound
    // control registered on an ancestor is carried by that ancestor's value
    // rather than by a field of its own, and clearing empties the path out of
    // every ancestor — so a MOUNTED ancestor still carrying it arrived after
    // the tombstone. A dormant one carries no such assurance: it is the shape
    // a stale copy takes, and letting it veto would quietly undo a deletion
    // the researcher confirmed.
    if (
      hasAncestorIn(submission.mountedPaths, removal.path) &&
      getValue(draft, removal.path) !== undefined
    ) {
      continue;
    }
    draft = removePath(draft, removal.path);
  }

  return draft;
}

type ResolvedDormant = Readonly<{ path: ObjectPath; value: FieldValue }>;

function partitionDormant(
  dormantFields: readonly DormantField[],
): Readonly<{ writes: ResolvedDormant[]; removals: ResolvedDormant[] }> {
  const writes: ResolvedDormant[] = [];
  const removals: ResolvedDormant[] = [];

  for (const dormant of dormantFields) {
    const path = dormant.path ?? safeFieldPath(dormant.name);
    if (path === null || path.length === 0) continue;
    (dormant.value === undefined ? removals : writes).push({
      path,
      value: dormant.value,
    });
  }

  return { writes, removals };
}

function hasDescendantIn(
  candidates: readonly ObjectPath[],
  path: ObjectPath,
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.length > path.length &&
      path.every((segment, index) => candidate[index] === segment),
  );
}

function hasAncestorIn(
  candidates: readonly ObjectPath[],
  path: ObjectPath,
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.length < path.length &&
      candidate.every((segment, index) => path[index] === segment),
  );
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
    // An emptied ROW is left in place. `omitValue` turns an omitted array
    // index into an `undefined` hole rather than renumbering the entries
    // around it, so pruning here would punch a gap in a list of prompts or
    // items. Removing a row is a deliberate array operation, not a
    // consequence of clearing one of its settings.
    if (typeof ancestorPath.at(-1) === 'number') break;
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
