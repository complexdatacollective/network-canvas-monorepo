import {
  createListenerMiddleware,
  type TypedStartListening,
} from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit/compat';
import { getFormValues } from 'redux-form';

import type { Stage } from '@codaco/protocol-validation';
import { getDraftRestoring } from '~/selectors/stageEditorDraft';

import type { RootState } from '../modules/root';
import {
  draftSnapshot,
  draftTimelineActions,
  resetDraft,
} from '../modules/stageEditorDraft';
import type { AppDispatch } from '../store';

// The redux-form name used by the stage editor.
const FORM_NAME = 'edit-stage';

// Debounce window (ms) for leaf-field CHANGE actions.
const DEBOUNCE_MS = 400;

// redux-form action type strings we react to.
const CHANGE = '@@redux-form/CHANGE';
const BLUR = '@@redux-form/BLUR';
const INITIALIZE = '@@redux-form/INITIALIZE';
const DESTROY = '@@redux-form/DESTROY';
const ARRAY_ACTIONS = new Set([
  '@@redux-form/ARRAY_PUSH',
  '@@redux-form/ARRAY_REMOVE',
  '@@redux-form/ARRAY_INSERT',
  '@@redux-form/ARRAY_SWAP',
  '@@redux-form/ARRAY_MOVE',
  '@@redux-form/ARRAY_SPLICE',
]);

// Shape of the redux-form actions we care about.
type ReduxFormAction = {
  type: string;
  meta?: { form?: string; field?: string };
  payload?: unknown;
};

const isReduxFormStageAction = (action: unknown): action is ReduxFormAction => {
  const candidate = action as ReduxFormAction;
  return (
    typeof candidate?.type === 'string' &&
    candidate.type.startsWith('@@redux-form/') &&
    candidate.meta?.form === FORM_NAME
  );
};

export const stageEditorDraftListenerMiddleware = createListenerMiddleware();

type AppStartListening = TypedStartListening<RootState, AppDispatch>;
const startAppListening =
  stageEditorDraftListenerMiddleware.startListening as AppStartListening;

// Manual debounce timer, scoped to this middleware instance. A pending timer
// means a leaf CHANGE is waiting to snapshot; immediate paths and BLUR flush it.
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

const clearPending = () => {
  if (pendingTimer !== null) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
};

startAppListening({
  predicate: (action) =>
    isReduxFormStageAction(action) || draftTimelineActions.reset.match(action),
  effect: (action, listenerApi) => {
    const { dispatch, getState } = listenerApi;

    // Read current form values and dispatch a snapshot if they exist.
    const snapshot = () => {
      const state = getState();
      // Defensive guard: a timer armed before a restore (undo/redo) may fire
      // mid-restore. Re-read state here and bail so we never snapshot the
      // intermediate values produced by applyDiff's change() calls.
      if (getDraftRestoring(state)) {
        return;
      }
      const values = getFormValues(FORM_NAME)(state);
      if (!values) {
        return;
      }
      // Dedup identical consecutive snapshots: comparing against the current
      // `present` (matching the slice's isEqual) keeps one undo step == one
      // logical change and prevents history bloat / no-op undos.
      if (isEqual(values, state.stageEditorDraft.history.present)) {
        return;
      }
      dispatch(draftSnapshot(values as Stage));
    };

    // Flush a pending debounce: take the snapshot now and clear the timer.
    const flush = () => {
      if (pendingTimer !== null) {
        clearPending();
        snapshot();
      }
    };

    // A draft reset (commit/cancel/stage-switch, or the INITIALIZE-driven
    // reset) is not a redux-form action, so cancel any armed leaf-CHANGE timer
    // here. Without this, a pending debounce could fire ~400ms later against a
    // now-reset or different stage and push a phantom/cross-stage snapshot.
    if (draftTimelineActions.reset.match(action)) {
      clearPending();
      return;
    }

    const formAction = action as ReduxFormAction;

    // Guard: ignore form changes produced while restoring (undo/redo).
    if (getDraftRestoring(getState())) {
      return;
    }

    const { type } = formAction;

    // INITIALIZE seeds the draft baseline; never produces a snapshot.
    if (type === INITIALIZE) {
      clearPending();
      dispatch(resetDraft(formAction.payload as Stage));
      return;
    }

    // DESTROY tears down the form; cancel any pending debounce and do not
    // snapshot.
    if (type === DESTROY) {
      clearPending();
      return;
    }

    // BLUR flushes any pending debounced snapshot; otherwise does nothing.
    if (type === BLUR) {
      flush();
      return;
    }

    // Array mutations and whole-element CHANGE paths snapshot immediately,
    // after flushing any pending debounce.
    //
    // Invariant: per-keystroke edits of bracket-indexed *nested leaves* (e.g.
    // `panels[0].title`) must DEBOUNCE — they have text after the last `]`.
    // Only a whole array-element replacement (e.g. `prompts[2]`) ends with a
    // closing bracket and is immediate. Note: an inline bracket-indexed
    // `Field` written directly into `edit-stage` would otherwise snapshot per
    // keystroke, hence the "ends with `]`" rule rather than "contains `[`".
    const field = formAction.meta?.field;
    const isWholeElementChange =
      type === CHANGE && typeof field === 'string' && field.endsWith(']');

    if (ARRAY_ACTIONS.has(type) || isWholeElementChange) {
      clearPending();
      snapshot();
      return;
    }

    // Leaf CHANGE paths are debounced: reset the timer and snapshot later.
    if (type === CHANGE) {
      clearPending();
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        snapshot();
      }, DEBOUNCE_MS);
    }
  },
});
