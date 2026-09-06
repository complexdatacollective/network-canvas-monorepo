import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  type FieldNameMode,
  resolveFieldPath,
  useFieldNamespacePath,
} from '@codaco/fresco-ui/form/FieldNamespace';
import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import {
  formatObjectPath,
  getValue,
  type ObjectPath,
  omitValue,
} from '@codaco/fresco-ui/form/utils/objectPath';
import isUnanswered from '@codaco/fresco-ui/form/validation/utils/isUnanswered';

import { commandsFromDraftChange, type StageFormDraft } from '../session.ts';
import { withoutValueAt } from './absentValues.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from './stageEditorContext.ts';

/** fresco-ui does not publish its store type, so it is recovered from the api. */
type FormStoreState = ReturnType<StageFormStoreApi['getState']>;

/**
 * Where a field actually lives, and what the committed draft holds there.
 *
 * A field's name is not always its path: an enclosing `FieldNamespace`
 * prefixes it, and `nameMode="opaque"` makes a name containing dots a single
 * segment rather than a route through the document. Both are resolved here
 * exactly as Fresco's `Field` resolves them, so the name the outline asks the
 * store about and the path the committed value is read from are the ones the
 * field is really registered under.
 *
 * The committed draft is the only account of what a path holds, and it is
 * enough because everything that throws a value away tells the SESSION. A
 * capability the researcher switches off is unset there before the form is
 * emptied (`useDiscardStageValues`), so a control arriving under that path
 * afterwards — a list behind a collapsed group, say — reads the same absence
 * every other reader does, without a second record of the decision to consult.
 *
 * The value is memoised because `initialValue` is a dependency of the effect
 * that registers a field: an unstable one re-registers it on every render.
 */
export function useResolvedFieldIdentity(
  name: string,
  nameMode: FieldNameMode = 'legacy',
): Readonly<{ registeredName: string; committedValue: unknown }> {
  const { committedFields } = useStageEditorForm();
  const namespace = useFieldNamespacePath();

  return useMemo(() => {
    const path = resolveFieldPath(namespace, name, nameMode);
    return {
      registeredName: formatObjectPath(path),
      committedValue: getValue(committedFields, path),
    };
  }, [committedFields, name, nameMode, namespace]);
}

/**
 * Throws everything at these paths away, for good.
 *
 * What switching a capability off means, and the one place that decides it.
 * The session is told first, in ONE batch, and the form is emptied afterwards
 * so the controls on screen do not wait for a re-seed that is never coming —
 * the session write is the form's own, so nothing is written back over the
 * researcher.
 *
 * The session rather than the form alone, because the form is not where the
 * stage lives. A bound list resolves every insertion, removal and reorder
 * against the draft the session holds right now, `useResolvedFieldIdentity`
 * seeds every field that mounts from it, and validation judges it — so a
 * decision recorded only in the form is a decision three of its readers never
 * hear, and the next row a researcher adds to a cleared list is resolved
 * against the rows the switch-off was supposed to have thrown away. Teaching
 * each of them to read the form's records instead cannot close that: a record
 * only exists where a field once was, and a capability's controls need not
 * have been on screen at all. One notion of what a path holds, and it is the
 * session's.
 *
 * So a switched-off capability is an edit like any other: it travels with the
 * batches, it is undone by the session's own undo — which brings the values
 * back, and with them the switch — and `rebaseCommand` keeps its `unset` as it
 * stands wherever it lands, because the researcher has decided. A collaborator
 * writing under the path AFTER that decision reaches the protocol is
 * authoritative and shows up as any other arrival does; one whose write is
 * still being reconciled against a clear the host has not applied yet loses it
 * to the clear, exactly as any other pending local edit would win over it.
 *
 * The container the removal empties goes too — `withoutValueAt`'s rule — so
 * the paths this unsets are the paths the save would have had to unset anyway.
 * Nothing is dispatched when the draft held nothing at any of them, so a reset
 * that finds an empty capability makes no batch at all.
 */
export function useDiscardStageValues(): (paths: readonly string[]) => void {
  const { applyOwnCommands } = useStageEditorForm();
  const clearStageValue = useClearStageValue();

  return useCallback(
    (paths: readonly string[]) => {
      // `applyOwnCommands([])` is how anything here reads the draft the session
      // holds NOW, rather than the snapshot this callback was built against.
      // An empty batch writes nothing, so it can never be refused.
      const { draft: current } = applyOwnCommands([]);
      let next = current;
      for (const path of paths) {
        const target = safePath(path);
        if (target === null || target.length === 0) continue;
        next = withoutValueAt(next, target);
      }
      applyOwnCommands(commandsFromDraftChange(current, next));

      for (const path of paths) clearStageValue(path);
    },
    [applyOwnCommands, clearStageValue],
  );
}

/**
 * Empties a path in the stage form, and everything that reaches it.
 *
 * The FORM only. Its caller has already told the session what it decided —
 * `useDiscardStageValues` with an unset, `useResetStageOnSubjectChange` with a
 * batch that also carries the template defaults it is resetting to — and this
 * brings the controls on screen level with that, immediately, rather than
 * leaving them showing values the draft no longer has.
 *
 * Confirming a deletion has to leave nothing holding the value anywhere, or
 * some later reader finds it again and the deletion undoes itself. Three
 * places can hold it, so all three are cleared:
 *
 * - the path itself and everything beneath it, which is what Fresco's
 *   structural `clearValue` does;
 * - the registered fields ABOVE it, which `clearValue` drops the sub-path out
 *   of for the reason its own comment gives — a container still holding a
 *   sub-path shows nothing while the inner fields are mounted, and surfaces it
 *   again once they are not;
 * - the DORMANT fields above it, which `clearValue` does not reach. Exactly
 *   the same staleness, one map over: a compound control hidden behind
 *   progressive disclosure keeps its whole object, and replays the cleared
 *   value back into the stage on save.
 *
 * Addressed structurally throughout. A capability may own a path whose name is
 * opaque — a protocol-authored variable id containing a dot, or a key with a
 * space — and the string API would read that as a route rather than a name.
 */
export function useClearStageValue(): (path: string) => void {
  const { storeApi } = useStageEditorForm();
  return useCallback(
    (path: string) => {
      const state = storeApi.getState();
      const target = safePath(path);
      const pathOperations = state.pathOperations;
      if (target === null || pathOperations === undefined) {
        state.clearValue(path);
        return;
      }

      pathOperations.clearValue(target);

      // Both maps: `clearValue` rewrites a REGISTERED ancestor to `{}` and
      // leaves it there, and never reaches a dormant one at all. Either way an
      // ancestor the clear emptied has to go, or the tombstone beneath it
      // removes nothing and the empty container reaches the saved stage.
      for (const [name, field] of [...state.fields, ...state.dormantValues]) {
        const ancestor = field.path ?? safePath(name);
        if (
          ancestor === null ||
          ancestor.length >= target.length ||
          !ancestor.every((segment, index) => target[index] === segment)
        ) {
          continue;
        }
        const relative = target.slice(ancestor.length);
        const cleared = withoutValueAt(field.value, relative);
        // Identity is `omitValue` reporting that it held nothing there.
        if (cleared === field.value) continue;
        // An ancestor the clear emptied goes too, rather than being parked as
        // `{}`. An empty object is not "no capability" to the protocol schema,
        // and parking one would also stop the tombstone beneath it from
        // removing anything — leaving the empty container in the saved stage.
        //
        // Unless it is a ROW. Removing an array index leaves a hole rather
        // than closing the gap, so an emptied row stays an empty row; taking
        // one out is a deliberate array operation.
        const emptied =
          isEmptyDictionary(cleared) && typeof ancestor.at(-1) !== 'number';
        pathOperations.setFieldValue(
          ancestor,
          emptied ? undefined : (cleared as FieldValue),
        );
      }
    },
    [storeApi],
  );
}

/**
 * What the stage draft currently holds at one path.
 *
 * The one way anything in this package reads a draft value it does not own a
 * field for: a filter checking the prompts it might contradict, a proposed
 * name reading the stage's subject. Sections address values by path and
 * nothing else — no stage path handed down from a host, no selector, no store
 * of the host's own.
 *
 * Resolution is the form store's own, through `hasValue`/`getValue`: a field
 * registered AT the path, the values assembled from fields registered above or
 * below it, then a field parked at it by progressive disclosure. Only when the
 * form holds none of those does the committed draft answer — before a
 * section's fields have registered, the draft is the only place the value is,
 * and a section that has not been opened yet would otherwise read every value
 * inside it as empty.
 *
 * Deliberately not built on `useStageHasAnyValue`'s machinery, which answers a
 * different question: whether a path holds an ANSWER, where an empty string,
 * an empty list and a container of blanks are all "nothing". That distinction
 * decides whether a capability is switched on. This one reports the value as
 * it is.
 *
 * Addressed structurally, so a protocol-authored key containing a dot or a
 * space is read as one name rather than as a route through the document. Reads
 * the stage form specifically, so it keeps working inside a dialog that has
 * mounted a form store of its own.
 */
export function useStageValue(path: string): unknown {
  const { storeApi, committedFields } = useStageEditorForm();

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );

  const getSnapshot = useCallback((): unknown => {
    const target = safePath(path);
    if (target === null) return undefined;

    const state = storeApi.getState();
    const pathOperations = state.pathOperations;
    if (pathOperations === undefined) {
      return state.hasValue(path)
        ? state.getValue(path)
        : getValue(committedFields, target);
    }
    return pathOperations.hasValue(target)
      ? pathOperations.getValue(target)
      : getValue(committedFields, target);
  }, [committedFields, path, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * How many times the stage form has been written to from an authoritative
 * draft.
 *
 * The form-owned record of `reseedStageForm` having run — a count Fresco's own
 * `Section` already watches to reapply `defaultOpen`. Anything in the editor
 * holding state OF ITS OWN about the draft has the same problem the panel does
 * (it was decided from a draft that has since been replaced beneath it) and so
 * needs the same signal, or the two disagree about the same capability.
 *
 * Deliberately not the session's own generation: what matters is not that the
 * draft moved but that the CONTROLS were rewritten from it, and only the form
 * knows when that happened.
 */
export function useFormRestoreVersion(): number {
  const { storeApi } = useStageEditorForm();

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );
  const getSnapshot = useCallback(
    () => storeApi.getState().formRestoreVersion,
    [storeApi],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Whether any of these paths currently holds a value.
 *
 * How an optional capability decides whether it is already switched on. It
 * takes the whole set at once because the paths a capability owns are read
 * together — skip logic is present if any of its three parts is — and because
 * a section cannot call a hook once per path in a list it computes.
 *
 * Each path is resolved in three steps, and each earns its place:
 *
 * 1. the field's own state — registered, or dormant because its section is
 *    collapsed. This is what lets a switched-off capability come back when
 *    undo restores the value it owned.
 * 2. the assembled form values, by path — for a container such as `skipLogic`
 *    whose parts register as `skipLogic.action` and friends.
 * 3. the committed draft, by path — the field has never registered at all.
 *    Without this a capability could never open on entry: its fields cannot
 *    register while it is closed, so nothing would put the committed value
 *    within reach.
 *
 * Reads the stage form specifically, so it keeps working inside a dialog that
 * has mounted a form store of its own.
 */
export function useStageHasAnyValue(paths: readonly string[]): boolean {
  const { storeApi, committedFields } = useStageEditorForm();
  // The paths themselves are the dependency, not the array carrying them: a
  // section that spells its list inline hands over a new array every render.
  // Serialised as JSON rather than joined, because a path may legally contain
  // whatever separator a join would pick — `["prompt text"]` contains a space.
  const key = JSON.stringify(paths);
  const latestPaths = useRef(paths);
  latestPaths.current = paths;

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );

  const getSnapshot = useCallback(() => {
    const state = storeApi.getState();
    return latestPaths.current.some((path) =>
      pathHasAnswer(state, committedFields, path),
    );
  }, [committedFields, key, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Whether anything has actually been entered at this value.
 *
 * A capability may own a CONTAINER path while its controls register the leaves
 * inside it, and merely mounting those controls assembles an object —
 * `{ action: undefined, destination: undefined }` — which is not an answer to
 * anything. Asking the question of the leaves instead is what stops an
 * untouched capability from reporting itself as configured, and then offering
 * to delete content nobody entered.
 */
function hasAnswer(value: unknown): boolean {
  if (isUnanswered(value)) return false;
  if (Array.isArray(value)) return value.some(hasAnswer);
  // `isUnanswered` already ruled out null, so anything left of object type is
  // a real container.
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(hasAnswer);
  }
  return true;
}

/**
 * Whether anything has been entered at this path.
 *
 * The form's knowledge outranks the draft it was opened from, path by path,
 * because the form is where the researcher has been working:
 *
 * 1. Anything the form holds AT, BENEATH, or — through a compound control
 *    registered above it — ABOVE this path counts as an answer. All three are
 *    asked before any of them can veto, because clearing a capability parks a
 *    tombstone at its own path, and content entered afterwards reaches this
 *    path from the other two directions, where that tombstone has no standing
 *    to speak for it.
 * 2. A record at the path holding nothing, with nothing beneath it, means
 *    empty and stops there. A field the researcher emptied by hand holds `''`,
 *    which is not an answer, while the draft it was opened with still holds
 *    the sentence they deleted — and falling through would report the
 *    capability configured from a value nothing on screen has any more.
 * 3. Whatever the committed draft holds, minus every sub-path the form has
 *    since emptied. Without this a capability could never open on entry, and
 *    one whose controls all sit behind a collapsed group would read as empty
 *    while the stage was configured — so switching it off would skip the
 *    confirmation and leave the capability quietly active in the saved stage.
 */
function pathHasAnswer(
  state: FormStoreState,
  committedFields: StageFormDraft,
  path: string,
): boolean {
  const target = safePath(path);
  if (target === null) return false;

  const records = formRecords(state);
  const exact = records.find((record) => samePath(record.path, target));
  if (exact && hasAnswer(exact.value)) return true;

  const below = records.filter((record) => isBelow(record.path, target));
  if (below.some((record) => hasAnswer(record.value))) return true;

  // A compound control registered ABOVE this path carries what sits at it —
  // one field owning `settings` answers for `settings.enabled`. The assembled
  // values cover the mounted ones; the records cover the parked ones.
  if (hasAnswer(getValue(state.getFormValues(), target))) return true;
  if (
    records.some(
      (record) =>
        isAbove(record.path, target) &&
        hasAnswer(readInside(record.value, target.slice(record.path.length))),
    )
  ) {
    return true;
  }

  // A record at exactly this path holding nothing, with nothing above or below
  // it holding anything either. That is the form saying the path is empty, and
  // it outranks whatever the draft was opened with — otherwise a field the
  // researcher emptied by hand would be answered from the sentence they
  // deleted, which the draft still remembers until the next save.
  if (exact) return false;

  // Every remaining known path is one the form knows is empty, so the draft's
  // memory of it is out of date.
  let committed = getValue(committedFields, target);
  for (const record of below) {
    committed = omitValue(committed, record.path.slice(target.length));
  }
  return hasAnswer(committed);
}

function readInside(value: unknown, relative: ObjectPath): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  // Every node reachable inside a container field's value is itself a value.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return getValue(value as Record<string, unknown>, relative);
}

function isEmptyDictionary(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

/**
 * A capability's path, read as a path.
 *
 * Canonical parsing rather than legacy, so a name is not mistaken for a route
 * through the document: `["prompt text"]` is one protocol-authored key
 * containing a space, and `skipLogic.action` is two segments. Both are what
 * `formatObjectPath` produces, which is how every other path here is spelled.
 */
function safePath(
  name: string,
  mode: FieldNameMode = 'path',
): ObjectPath | null {
  try {
    return resolveFieldPath([], name, mode);
  } catch {
    return null;
  }
}

/** Every field the form holds, mounted or parked, addressed structurally. */
function formRecords(
  state: FormStoreState,
): { path: ObjectPath; value: unknown }[] {
  const records: { path: ObjectPath; value: unknown }[] = [];
  for (const source of [state.fields, state.dormantValues]) {
    for (const [name, field] of source) {
      // A stored path is authoritative; a name without one is a plain field
      // whose own name is its path.
      const path = field.path ?? safePath(name, 'legacy');
      if (path !== null) records.push({ path, value: field.value });
    }
  }
  return records;
}

const samePath = (a: ObjectPath, b: ObjectPath) =>
  a.length === b.length && a.every((segment, index) => b[index] === segment);

const isBelow = (candidate: ObjectPath, path: ObjectPath) =>
  candidate.length > path.length &&
  path.every((segment, index) => candidate[index] === segment);

const isAbove = (candidate: ObjectPath, path: ObjectPath) =>
  candidate.length < path.length &&
  candidate.every((segment, index) => path[index] === segment);
