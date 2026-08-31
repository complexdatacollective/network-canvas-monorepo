import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';

import {
  type FieldNameMode,
  resolveFieldPath,
  useFieldNamespacePath,
} from '@codaco/fresco-ui/form/FieldNamespace';
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
 * Clears everything at a path in the stage form, descendants included.
 *
 * The structural operation rather than a write of `undefined`, because a
 * capability may own a CONTAINER path while the fields inside it are
 * separately registered — and some of those may already be dormant behind a
 * collapsed group of advanced options. Parking a tombstone at the container
 * leaves those untouched, so reopening the group would restore content the
 * researcher had just confirmed deleting.
 */
export function useClearStageValue(): (path: string) => void {
  const { storeApi } = useStageEditorForm();
  return useCallback(
    (path: string) => {
      storeApi.getState().clearValue(path);
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
 * 1. Anything the form holds AT or BENEATH this path, mounted or parked
 *    alike, counts as an answer. Both are asked before either can veto,
 *    because clearing a container capability parks a tombstone at the
 *    container itself — and content entered after that tombstone lives
 *    beneath it, where the tombstone has no standing to speak for it.
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

  const exact = state.getFieldState(path);
  if (exact !== undefined && hasAnswer(exact.value)) return true;

  const known = descendantRecords(state, target);
  if (known.some((record) => hasAnswer(record.value))) return true;

  // A record at exactly this path, holding nothing, with nothing beneath it
  // holding anything either. That is the form saying the path is empty, and it
  // outranks whatever the draft was opened with — otherwise clearing a
  // capability would be undone by the draft's memory of it.
  if (exact !== undefined) return false;

  // Every remaining known path is one the form knows is empty, so the draft's
  // memory of it is out of date.
  let committed = getValue(committedFields, target);
  for (const record of known) {
    committed = omitValue(committed, record.path.slice(target.length));
  }
  return hasAnswer(committed);
}

function descendantRecords(
  state: FormStoreState,
  target: ObjectPath,
): { path: ObjectPath; value: unknown }[] {
  const records: { path: ObjectPath; value: unknown }[] = [];

  for (const source of [state.fields, state.dormantValues]) {
    for (const [name, field] of source) {
      const path = field.path ?? safePath(name);
      if (
        path === null ||
        path.length <= target.length ||
        !target.every((segment, index) => path[index] === segment)
      ) {
        continue;
      }
      records.push({ path, value: field.value });
    }
  }

  return records;
}

function safePath(name: string): ObjectPath | null {
  try {
    return resolveFieldPath([], name);
  } catch {
    return null;
  }
}
