import { resolveFieldPath } from '@codaco/fresco-ui/form/FieldNamespace';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import {
  getValue,
  type ObjectPath,
  setValue,
} from '@codaco/fresco-ui/form/utils/objectPath';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { StageFormDraft } from '../session.ts';
import { withoutValueAt } from './absentValues.ts';
import type { StageFormStoreApi } from './stageEditorContext.ts';

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
  /**
   * Where the still-mounted fields live.
   *
   * Two jobs, and they are the same fact. It says which parts of
   * `submittedValues` this submit is entitled to write, and where each one
   * goes; and it says which parts of the draft a hidden field must not be
   * replayed over.
   */
  mountedPaths: readonly ObjectPath[];
  dormantFields: readonly DormantField[];
}>;

/**
 * The stage draft a submit should produce.
 *
 * Four rules, applied in this order:
 *
 * 1. Anything the editor never rendered survives untouched. An interface with
 *    no section for `skipLogic` must not delete skip logic someone authored
 *    before switching interfaces — and neither must a section that owns one
 *    part of a nested value delete the parts beside it. A Family Pedigree's
 *    form section owns `nodeConfig.form` and nothing else under `nodeConfig`.
 * 2. Fields the form still has mounted replace the value at their OWN path,
 *    shallowest first. That is the unit the session turns into a command, and
 *    writing at the path rather than at the top-level key above it is what
 *    lets a section own a nested value without having to render every sibling
 *    it happens to share a key with.
 * 3. A hidden field's value is written back where it belongs. Hiding a field
 *    is not a decision about its value.
 * 4. A field holding nothing is REMOVED rather than set to anything, whether
 *    it was discarded or is simply on screen holding nothing. Absence is how
 *    the protocol schema spells "this capability is off"; `null` is not a
 *    value it accepts anywhere, and neither is the `{}` that writing an
 *    absence INTO a container would leave standing where the container ought
 *    not to be at all.
 */
export function stageDraftFromSubmission(
  submission: StageDraftSubmission,
): SectionDoc {
  let draft: SectionDoc = { ...submission.currentFields };

  // Shallowest first, for the reason the dormant writes below are: a field
  // registered at a container path must not overwrite the edit made to a field
  // registered inside it. Fresco's own assembly of the submitted values
  // resolves that overlap in the same order — and it is why a container a
  // removal below prunes can be put back by a deeper field that does hold
  // something.
  for (const path of submission.mountedPaths.toSorted(
    (a, b) => a.length - b.length,
  )) {
    const submitted = submittedValueAt(submission.submittedValues, path);
    // Only what the submission actually carries. A field the submitted values
    // have nothing at is a field that was not registered when they were
    // assembled, and writing `undefined` there would delete a value on the
    // strength of a reading that never happened. A field holding `undefined`
    // is the opposite — the researcher emptied it — and that IS carried.
    if (!submitted.present) continue;
    if (submitted.value === undefined) {
      // Removed rather than written, which is rule 4 arriving one loop early
      // and for the same reason. `setValue` would put the key there holding
      // `undefined`, and every container on the way to it — so a capability
      // switched back on and left empty saves `cardOptions: {}`, a key the
      // researcher did not write, in a schema where other containers refuse an
      // empty object outright. What the form holds nothing at, the stage holds
      // nothing at.
      draft = withoutValueAt(draft, path);
      continue;
    }
    // `setValue` copies every container it traverses, so this cannot write
    // through into the session's own frozen snapshot.
    setValue(draft, path, submitted.value);
  }

  const { writes, removals } = partitionDormant(submission.dormantFields);

  // A hidden field is dropped outright when the form still has a field mounted
  // on either side of it. The submitted values already carry what that mounted
  // field holds, and replaying around it would put a stale reading back over
  // something the researcher can currently see — whether the hidden field is
  // the container above it or a leaf inside it.
  const applicable = writes.filter(
    (write) =>
      !hasDescendantIn(submission.mountedPaths, write.path) &&
      !hasAncestorIn(submission.mountedPaths, write.path),
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
    draft = withoutValueAt(draft, removal.path);
  }

  return draft;
}

/**
 * Where every field the form still has mounted lives.
 *
 * The submitted values are assembled from these, so a hidden container that
 * encloses one of them must not be replayed over the top of what they hold.
 */
export function mountedPathsOf(storeApi: StageFormStoreApi): ObjectPath[] {
  return [...storeApi.getState().fields].map(
    ([name, field]) => field.path ?? resolveFieldPath([], name),
  );
}

/**
 * Every field the form is holding but not showing, as the store parked it.
 *
 * The submitted values cover only mounted fields, so without this a value
 * hidden behind a collapsed group would look identical to one that was
 * deliberately thrown away.
 */
export function dormantFieldsOf(storeApi: StageFormStoreApi): DormantField[] {
  return [...storeApi.getState().dormantValues].map(([name, field]) => ({
    name,
    ...(field.path === undefined ? {} : { path: field.path }),
    value: field.value,
  }));
}

/**
 * What the submitted values hold at a path, and whether they hold anything
 * there at all.
 *
 * The two answers have to be separable: a field the researcher emptied is
 * carried as `undefined`, and a path the submission never reached is also
 * `undefined` to a plain read. Own properties only, so nothing arrives from a
 * prototype.
 */
function submittedValueAt(
  values: Readonly<Record<string, FieldValue>>,
  path: ObjectPath,
): Readonly<{ present: boolean; value: FieldValue }> {
  let cursor: unknown = values;
  for (const segment of path) {
    if (cursor === null || typeof cursor !== 'object') {
      return { present: false, value: undefined };
    }
    const descriptor = Object.getOwnPropertyDescriptor(cursor, segment);
    if (descriptor === undefined || !('value' in descriptor)) {
      return { present: false, value: undefined };
    }
    cursor = descriptor.value;
  }
  // Everything the form store holds is a `FieldValue`, and every container it
  // assembled them into is one too.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return { present: true, value: cursor as FieldValue };
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
