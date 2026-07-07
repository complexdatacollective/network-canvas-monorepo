import {
  combineReducers,
  createAction,
  createSlice,
  type PayloadAction,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { isEqual } from 'es-toolkit/compat';
import { change, getFormValues } from 'redux-form';

import type { Stage } from '@codaco/protocol-validation';
import type { AppDispatch, RootState } from '~/ducks/store';
import { getDraftRestoring } from '~/selectors/stageEditorDraft';

import createTimelineReducer, {
  createTimelineActions,
} from '../middleware/timeline';

// Instance-scoped timeline actions for the stage editor draft history.
export const draftTimelineActions = createTimelineActions('stageEditorDraft');

// Only a snapshot action produces a new `present` in the draft timeline,
// guaranteeing that unrelated actions never create new timeline entries.
export const draftSnapshot = createAction<Stage>('stageEditorDraft/snapshot');

const draftPresentReducer = (
  state: Stage | null = null,
  action: UnknownAction,
): Stage | null => {
  if (draftSnapshot.match(action)) {
    return action.payload;
  }

  // Return the same reference for every other action so the timeline reducer
  // treats them as no-ops (no new point on the timeline).
  return state;
};

// `exclude` is essential: the timeline reducer's `present === newPresent`
// short-circuit never fires (an Immer draft proxy is never reference-equal to
// the `current()` snapshot the wrapped reducer returns), so without a filter
// EVERY action dispatched anywhere in the app would push a draft snapshot.
// Recording only `draftSnapshot` actions makes one undo step == one logical
// change. The scoped undo/redo/reset/jump actions are handled separately.
const historyReducer = createTimelineReducer<Stage | null>(
  draftPresentReducer,
  {
    name: 'stageEditorDraft',
    exclude: (action) => !draftSnapshot.match(action),
  },
);

// Sibling UI reducer holds state that has no room in the timeline shape.
type UiState = {
  restoring: boolean;
  initialValues: Stage | null;
};

const uiInitialState: UiState = {
  restoring: false,
  initialValues: null,
};

const uiSlice = createSlice({
  name: 'stageEditorDraftUi',
  initialState: uiInitialState,
  reducers: {
    setRestoring: (state, action: PayloadAction<boolean>) => {
      state.restoring = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(draftTimelineActions.reset, (state, action) => {
      state.initialValues = (action.payload as Stage) ?? null;
      state.restoring = false;
    });
  },
});

export const setRestoring = uiSlice.actions.setRestoring;

const uiReducer = uiSlice.reducer;

const reducer = combineReducers({
  history: historyReducer,
  ui: uiReducer,
});

export default reducer;

// Thunks

export const resetDraft = (values: Stage | null) => (dispatch: AppDispatch) => {
  dispatch(draftTimelineActions.reset(values));
};

// Leaf-field edits are debounced before they snapshot (see the draft
// listener), so the latest keystrokes may not be in history yet when the user
// undoes/redoes — via the keyboard shortcut OR the toolbar button. Commit any
// such in-progress edit first, so a step never skips or drops it. (The
// listener's stale debounce timer, if any, is harmless: after the step the form
// matches `present`, so it dedupes to a no-op; a fresh edit clears it.)
const flushPendingEdit = (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState();
  if (getDraftRestoring(state)) return;
  const values = getFormValues('edit-stage')(state);
  if (!values) return;
  if (isEqual(values, state.stageEditorDraft.history.present)) return;
  dispatch(draftSnapshot(values as Stage));
};

export const draftUndo =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    flushPendingEdit(dispatch, getState);

    const state = getState();
    const past = state.stageEditorDraft.history.past;
    if (!past || past.length === 0) {
      return;
    }

    const target = (past[past.length - 1] ?? {}) as Record<string, unknown>;
    const current = (getFormValues('edit-stage')(state) ?? {}) as Record<
      string,
      unknown
    >;

    dispatch(draftTimelineActions.undo());
    applyDiff(dispatch, current, target);
  };

export const draftRedo =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    // A pending edit branches history: committing it correctly clears the redo
    // stack, so an in-progress edit always wins over a stale redo.
    flushPendingEdit(dispatch, getState);

    const state = getState();
    const future = state.stageEditorDraft.history.future;
    if (!future || future.length === 0) {
      return;
    }

    const target = (future[0] ?? {}) as Record<string, unknown>;
    const current = (getFormValues('edit-stage')(state) ?? {}) as Record<
      string,
      unknown
    >;

    dispatch(draftTimelineActions.redo());
    applyDiff(dispatch, current, target);
  };

// Apply only the changed fields from `target` onto the form, wrapped in a
// restoring flag so listeners can ignore the resulting form changes.
const applyDiff = (
  dispatch: AppDispatch,
  current: Record<string, unknown>,
  target: Record<string, unknown>,
) => {
  dispatch(setRestoring(true));

  const keys = new Set([...Object.keys(current), ...Object.keys(target)]);
  for (const key of keys) {
    if (!isEqual(current[key], target[key])) {
      dispatch(change('edit-stage', key, target[key]));
    }
  }

  dispatch(setRestoring(false));
};
