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

import type { StageFormDraft } from '../session.ts';
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
 * Empties a path in the stage form, and everything that reaches it.
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
        const cleared = clearInside(field.value, relative);
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
 * 2. A tombstone with nothing beneath it means empty, and stops there:
 *    switching a capability off parks that record ON PURPOSE, and falling
 *    through would report the capability configured again from the draft it
 *    was opened with. A capability owning a container whose controls are all
 *    hidden behind a collapsed group has no field at the container and nothing
 *    in the assembled values, and its content would otherwise be invisible
 *    here — so switching it off would skip the confirmation, skip the clear,
 *    and leave the capability quietly active in the saved stage.
 * 3. Whatever the committed draft holds, minus every sub-path the form has
 *    since emptied.
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
  // it outranks whatever the draft was opened with — otherwise clearing a
  // capability would be undone by the draft's memory of it.
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

/**
 * A copy of `value` with `relative` removed, and with any container that
 * removal emptied removed as well.
 *
 * The same rule the submit merge applies to the stage draft, applied here to
 * one field's value: an emptied object is not a value the schema accepts,
 * while an emptied ROW stays, because removing an array index leaves a hole
 * rather than closing the gap.
 */
function clearInside(value: unknown, relative: ObjectPath): unknown {
  const removed = omitValue(value, relative);
  if (removed === value) return value;

  let next = removed;
  for (let depth = relative.length - 1; depth >= 1; depth -= 1) {
    const ancestorPath = relative.slice(0, depth);
    if (!isEmptyDictionary(readInside(next, ancestorPath))) break;
    if (typeof ancestorPath.at(-1) === 'number') break;
    next = omitValue(next, ancestorPath);
  }
  return next;
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
