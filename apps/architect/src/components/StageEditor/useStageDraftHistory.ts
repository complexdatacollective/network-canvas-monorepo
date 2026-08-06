import { get, isEqual } from 'es-toolkit/compat';
import { useCallback, useMemo } from 'react';
import { useStore } from 'react-redux';

import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import type { Stage } from '@codaco/protocol-validation';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import {
  draftSnapshot,
  draftTimelineActions,
} from '~/ducks/modules/stageEditorDraft';
import type { RootState } from '~/ducks/store';
import { getCanRedoDraft, getCanUndoDraft } from '~/selectors/stageEditorDraft';

import {
  type StageFormStoreApi,
  useStageFormContext,
} from './stageFormContext';

const coversTopLevelKey = (fieldName: string, key: string) =>
  fieldName === key ||
  fieldName.startsWith(`${key}.`) ||
  fieldName.startsWith(`${key}[`);

/**
 * Writes the difference between the form's current values and a timeline
 * snapshot back into the form store.
 *
 * The store is keyed by flat field names ('prompts',
 * 'introductionPanel.title'); the timeline holds assembled stage objects. The
 * diff is therefore computed per known field name, reading the target value
 * out of the snapshot by path:
 *
 * - registered names are written straight through;
 * - dormant names — fields that have been mounted at some point in this
 *   store's life and are currently unmounted (a collapsed or toggled-off
 *   section) — are written into dormant storage, where the field picks the
 *   value back up when it remounts;
 * - a top-level key with no field name behind it at all is written whole,
 *   which also lands in dormant storage. A section keyed on value presence
 *   (`startExpanded={!!value}`) reopens on it and its fields then register the
 *   restored value into the form's output.
 */
const applyDiff = (
  storeApi: StageFormStoreApi,
  current: Record<string, unknown>,
  target: Record<string, unknown>,
) => {
  const { fields, dormantValues, getFieldState, setFieldValue } =
    storeApi.getState();

  const knownNames = [...fields.keys(), ...dormantValues.keys()];

  for (const name of knownNames) {
    const targetValue = get(target, name) as FieldValue;
    if (isEqual(getFieldState(name)?.value, targetValue)) continue;
    setFieldValue(name, targetValue);
  }

  const topLevelKeys = new Set([
    ...Object.keys(current),
    ...Object.keys(target),
  ]);

  for (const key of topLevelKeys) {
    if (knownNames.some((name) => coversTopLevelKey(name, key))) continue;
    if (isEqual(current[key], target[key])) continue;
    setFieldValue(key, target[key] as FieldValue);
  }
};

export type StageDraftHistory = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** Commit an in-progress (still debounced) edit to the timeline. */
  flushPendingEdit: () => void;
};

/**
 * Undo/redo over the stage editor's draft timeline, applied to the fresco-ui
 * form store. Replaces the `draftUndo`/`draftRedo` thunks, which read and
 * wrote redux-form's values.
 */
export const useStageDraftHistory = (): StageDraftHistory => {
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const { storeApi, draft } = useStageFormContext();

  const canUndo = useAppSelector(getCanUndoDraft);
  const canRedo = useAppSelector(getCanRedoDraft);

  const flushPendingEdit = useCallback(() => {
    draft.cancelPendingSnapshot();

    const formState = storeApi.getState();
    if (formState.fields.size === 0) return;

    const values = formState.getFormValues() as unknown as Stage;
    if (isEqual(values, reduxStore.getState().stageEditorDraft.history.present))
      return;

    dispatch(draftSnapshot(values));
  }, [dispatch, draft, reduxStore, storeApi]);

  const step = useCallback(
    (direction: 'undo' | 'redo') => {
      // Leaf edits are debounced before they snapshot, so the latest
      // keystrokes may not be on the timeline yet. Committing them first stops
      // a step skipping or dropping them; for redo it also branches history,
      // so an in-progress edit always wins over a stale redo.
      flushPendingEdit();

      const { past, future } = reduxStore.getState().stageEditorDraft.history;
      const target = (
        direction === 'undo' ? past[past.length - 1] : future[0]
      ) as Record<string, unknown> | undefined;

      if (!target) return;

      const current = storeApi.getState().getFormValues() as Record<
        string,
        unknown
      >;

      dispatch(
        direction === 'undo'
          ? draftTimelineActions.undo()
          : draftTimelineActions.redo(),
      );

      draft.runRestore(() => {
        applyDiff(storeApi, current, target);
      });
    },
    [dispatch, draft, flushPendingEdit, reduxStore, storeApi],
  );

  const undo = useCallback(() => step('undo'), [step]);
  const redo = useCallback(() => step('redo'), [step]);

  return useMemo(
    () => ({ canUndo, canRedo, undo, redo, flushPendingEdit }),
    [canRedo, canUndo, flushPendingEdit, redo, undo],
  );
};
