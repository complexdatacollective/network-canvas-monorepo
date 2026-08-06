import {
  combineReducers,
  createAction,
  createSlice,
  type PayloadAction,
  type UnknownAction,
} from '@reduxjs/toolkit';

import type { Stage } from '@codaco/protocol-validation';
import type { AppDispatch } from '~/ducks/store';

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
  // Debounced mirror of the stage form's current values, written by
  // `StageFormBridge` while the fresco-ui stage form is mounted. It is the one
  // Redux-side view of form state for readers that cannot use a React hook
  // (dirty tracking, `isUsed`, the preview payload). Null whenever no stage
  // form is mounted.
  liveValues: Stage | null;
  // Edits that happen outside the stage form but still make the draft dirty
  // (codebook writes triggered from a section). Replaces the `_modified`
  // sentinel field that used to be written into the form itself.
  externalEditCount: number;
};

const uiInitialState: UiState = {
  restoring: false,
  initialValues: null,
  liveValues: null,
  externalEditCount: 0,
};

const uiSlice = createSlice({
  name: 'stageEditorDraftUi',
  initialState: uiInitialState,
  reducers: {
    setRestoring: (state, action: PayloadAction<boolean>) => {
      state.restoring = action.payload;
    },
    setLiveValues: (state, action: PayloadAction<Stage | null>) => {
      state.liveValues = action.payload;
    },
    markExternalEdit: (state) => {
      state.externalEditCount += 1;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(draftTimelineActions.reset, (state, action) => {
      state.initialValues = (action.payload as Stage) ?? null;
      state.restoring = false;
      // Seeding the baseline also seeds the mirror, so the draft cannot read
      // as dirty in the window between mounting a stage form and its first
      // debounced mirror write.
      state.liveValues = (action.payload as Stage) ?? null;
      state.externalEditCount = 0;
    });
  },
});

export const setRestoring = uiSlice.actions.setRestoring;
export const setLiveValues = uiSlice.actions.setLiveValues;
export const markExternalEdit = uiSlice.actions.markExternalEdit;

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
