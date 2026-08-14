import {
  combineReducers,
  createAction,
  createSlice,
  type PayloadAction,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { v1 as uuid } from 'uuid';

import type { Codebook, Stage } from '@codaco/protocol-validation';
import type { AppDispatch, RootState } from '~/ducks/store';

import createTimelineReducer, {
  createTimelineActions,
} from '../middleware/timeline';
import codebookReducer from './protocol/codebook';
import { commitStageEditorDraft } from './protocol/commitStageEditorDraft';
import { isStageEditorCodebookAction } from './protocol/stageEditorCodebookMeta';

/**
 * One point on the stage editor's draft timeline.
 *
 * `stage` is the form's values; `codebook` is the editor's private copy of the
 * protocol codebook, which every nested field/variable editor writes instead
 * of the canonical one. Holding both in the same timeline entry is what makes
 * a stage edit transactional: discarding drops the entry, and undo/redo rewind
 * the stage and the codebook together — so undoing past a variable's creation
 * cannot leave that variable behind to be committed as an orphan.
 */
export type StageEditorDraftPresent = {
  stage: Stage | null;
  codebook: Codebook | null;
};

// Instance-scoped timeline actions for the stage editor draft history.
export const draftTimelineActions = createTimelineActions('stageEditorDraft');

// Only a snapshot action produces a new `present` in the draft timeline,
// guaranteeing that unrelated actions never create new timeline entries.
export const draftSnapshot = createAction<Stage>('stageEditorDraft/snapshot');

/**
 * Re-baselines the STAGE half of the draft, leaving the codebook half — both
 * the working copy and its baseline — exactly as it is.
 *
 * Auto-naming folds its first generated label into the baseline so a brand-new
 * stage does not open dirty. Expressing that as a full `reset` forced a choice
 * between two bad outcomes: carrying the baseline codebook would REVERT any
 * variable created so far (leaving the form holding a UUID that no longer
 * exists), and carrying the working copy would launder a real codebook edit
 * into "unchanged". Touching only the stage is the answer to both.
 */
export const rebaselineDraftStage = createAction<Stage>(
  'stageEditorDraft/rebaselineStage',
);

// Closing a protocol must close any transaction taken from it. Matched by type
// rather than by importing the `activeProtocol` slice — the same idiom the
// timeline reducer already uses for `setActiveProtocol` — so the draft duck
// never has to import the protocol duck that reduces alongside it.
const PROTOCOL_LIFECYCLE_ACTIONS = new Set([
  'activeProtocol/setActiveProtocol',
  'activeProtocol/clearActiveProtocol',
]);

const endsProtocolSession = (action: UnknownAction): boolean =>
  typeof action.type === 'string' &&
  PROTOCOL_LIFECYCLE_ACTIONS.has(action.type);

const draftPresentReducer = (
  state: StageEditorDraftPresent | null = null,
  action: UnknownAction,
): StageEditorDraftPresent | null => {
  if (draftSnapshot.match(action) || rebaselineDraftStage.match(action)) {
    return { stage: action.payload, codebook: state?.codebook ?? null };
  }

  // A draft can never outlive the protocol it was taken from: left in place,
  // its codebook would be overlaid onto the NEXT protocol opened, and its open
  // transaction would swallow codebook writes made anywhere else (#1382).
  if (endsProtocolSession(action)) {
    return null;
  }

  // A codebook write from inside the stage editor reduces against the draft
  // copy using the very same reducer the canonical codebook uses.
  if (isStageEditorCodebookAction(action) && state?.codebook) {
    const codebook = codebookReducer(state.codebook, action);
    if (codebook !== state.codebook) {
      return { ...state, codebook };
    }
  }

  // Return the same reference for every other action so the timeline reducer
  // treats them as no-ops (no new point on the timeline).
  return state;
};

// `exclude` is essential: the timeline reducer's `present === newPresent`
// short-circuit never fires (an Immer draft proxy is never reference-equal to
// the `current()` snapshot the wrapped reducer returns), so without a filter
// EVERY action dispatched anywhere in the app would push a draft snapshot.
// Recording only `draftSnapshot` actions and the editor's own codebook writes
// makes one undo step == one logical change. The scoped undo/redo/reset/jump
// actions are handled separately.
const historyReducer = createTimelineReducer<StageEditorDraftPresent | null>(
  draftPresentReducer,
  {
    name: 'stageEditorDraft',
    // A re-baseline replaces `present` in place rather than adding a point, so
    // it is excluded alongside everything that is not a real change.
    exclude: (action) =>
      !draftSnapshot.match(action) && !isStageEditorCodebookAction(action),
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
  // The codebook as it stood when the editor opened. Compared against the
  // draft copy in `history.present.codebook` to decide whether the researcher
  // has made codebook edits, which is what makes discard prompt. Non-null
  // exactly while a codebook transaction is open, so it doubles as the signal
  // that codebook writes must be routed to the draft.
  initialCodebook: Codebook | null;
};

const uiInitialState: UiState = {
  restoring: false,
  initialValues: null,
  liveValues: null,
  initialCodebook: null,
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
  },
  extraReducers: (builder) => {
    builder
      .addCase(draftTimelineActions.reset, (state, action) => {
        const payload = action.payload as StageEditorDraftPresent | null;
        state.initialValues = payload?.stage ?? null;
        state.restoring = false;
        // Seeding the baseline also seeds the mirror, so the draft cannot read
        // as dirty in the window between mounting a stage form and its first
        // debounced mirror write.
        state.liveValues = payload?.stage ?? null;
        state.initialCodebook = payload?.codebook ?? null;
      })
      .addCase(rebaselineDraftStage, (state, action) => {
        state.initialValues = action.payload;
        state.liveValues = action.payload;
      })
      .addMatcher(endsProtocolSession, () => uiInitialState);
  },
});

export const setRestoring = uiSlice.actions.setRestoring;
export const setLiveValues = uiSlice.actions.setLiveValues;

const uiReducer = uiSlice.reducer;

const reducer = combineReducers({
  history: historyReducer,
  ui: uiReducer,
});

export default reducer;

// Thunks

export const resetDraft =
  (values: StageEditorDraftPresent | null) => (dispatch: AppDispatch) => {
    dispatch(draftTimelineActions.reset(values));
  };

/**
 * Opens a stage editor session: seeds the form baseline AND takes the editor's
 * private copy of the canonical codebook, which is what makes every codebook
 * write from here until commit or discard transactional (#1382).
 *
 * The canonical slice is read here rather than passed in by the component, so
 * the editor never has to know where the committed codebook lives — and reads
 * it straight off the slice (as `userActions` and the analytics listener do)
 * rather than through `selectors/protocol`, which stage-editor component tests
 * routinely mock.
 */
export const openStageEditorDraft =
  (stage: Stage | null) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(
      draftTimelineActions.reset({
        stage,
        codebook: getState().activeProtocol?.present?.codebook ?? null,
      }),
    );
  };

/**
 * Promotes the stage editor's draft to the canonical protocol.
 *
 * The stage and every codebook edit made inside the editor land in one action,
 * so the protocol timeline gains one undo step and the validation/persistence
 * pipeline sees one snapshot. `resetDraft(null)` then closes the transaction,
 * after which codebook writes route to the canonical codebook again.
 */
export const commitStageEditorDraftThunk =
  (stageId: string | null, stage: Stage, index?: number) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    const { history } = state.stageEditorDraft;

    // A stage deleted from under the editor has nowhere to save to: the stages
    // reducer would ignore the commit while the codebook reducer applied the
    // draft anyway, leaving the codebook edits of a stage that no longer
    // exists behind. Committing nothing keeps the pair atomic. The editor
    // redirects out of a missing stage on its own (`StageEditor`), resetting
    // the draft as it goes.
    const stageExists =
      stageId === null ||
      (state.activeProtocol?.present?.stages ?? []).some(
        ({ id }) => id === stageId,
      );

    if (!stageExists) return;

    dispatch(
      commitStageEditorDraft({
        stageId,
        // A brand-new stage has no id until it is committed; `stages` used to
        // mint one inside `createStageAsync`, which cannot be part of a single
        // atomic action.
        stage: stageId ? stage : { ...stage, id: uuid() },
        index,
        codebook: history.present?.codebook ?? null,
      }),
    );

    dispatch(resetDraft(null));
  };
