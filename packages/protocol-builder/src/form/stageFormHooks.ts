import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { FieldValue } from '@codaco/fresco-ui/form/store/types';
import { getValue } from '@codaco/fresco-ui/form/utils/objectPath';

import type { StageFormDraft } from '../session.ts';
import { isBlankFieldValue } from './blankValue.ts';
import {
  type StageFormStoreApi,
  useStageEditorForm,
} from './stageEditorContext.ts';

/** fresco-ui does not publish its store type, so it is recovered from the api. */
type FormStoreState = ReturnType<StageFormStoreApi['getState']>;

/**
 * A committed value, for a field's `initialValue`. Memoised because
 * `initialValue` is a dependency of the register effect inside `useField`: an
 * unstable one re-registers the field on every render.
 */
export function useStageInitialValue<T = unknown>(path: string): T | undefined {
  const { committedFields } = useStageEditorForm();
  return useMemo(
    () => getValue(committedFields, path) as T | undefined,
    [committedFields, path],
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
  // The paths are the dependency, not the array carrying them: a section that
  // spells its list inline hands over a new array on every render.
  const key = paths.join(' ');

  const subscribe = useCallback(
    (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
    [storeApi],
  );

  const getSnapshot = useCallback(() => {
    const state = storeApi.getState();
    const values = state.getFormValues();
    return key
      .split(' ')
      .some(
        (path) =>
          path !== '' &&
          !isBlankFieldValue(
            resolveValue(state, values, committedFields, path),
          ),
      );
  }, [committedFields, key, storeApi]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
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
