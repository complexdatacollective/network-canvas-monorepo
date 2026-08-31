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
 * Writes into the stage form by name or path. An unregistered name is parked
 * as a dormant pending write and re-attaches when the field next mounts, so
 * this reaches a field whose section is collapsed or switched off — which is
 * exactly the case a capability has to clear.
 */
export function useSetStageValue(): (path: string, value: FieldValue) => void {
  const { storeApi } = useStageEditorForm();
  return useCallback(
    (path: string, value: FieldValue) => {
      storeApi.getState().setFieldValue(path, value);
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
    const values = state.getFormValues();
    return latestPaths.current.some((path) =>
      hasAnswer(resolveValue(state, values, committedFields, path)),
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
 * A field the form knows about answers for itself, even when its answer is
 * `undefined`.
 *
 * That distinction is the whole point: switching a capability off parks a
 * dormant field holding `undefined` ON PURPOSE, and treating that as "no
 * answer here" would fall through to the value the stage was opened with —
 * so the capability would go on reporting itself as configured, and closing
 * it again would offer to delete content that is already gone.
 */
function resolveValue(
  state: FormStoreState,
  values: Record<string, FieldValue>,
  committedFields: StageFormDraft,
  path: string,
): unknown {
  const fieldState = state.getFieldState(path);
  if (fieldState !== undefined) return fieldState.value;
  return getValue(values, path) ?? getValue(committedFields, path);
}
