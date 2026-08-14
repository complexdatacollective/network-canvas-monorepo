import {
  createSlice,
  current,
  type PayloadAction,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { navigate } from 'wouter/use-browser-location';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import type { AppDispatch, RootState } from '~/ducks/store';
import {
  getCanRedo,
  getCanUndo,
  getProtocol,
  getRedoTargetPath,
  getUndoTargetPath,
} from '~/selectors/protocol';
import { resolveTimelineNavTarget } from '~/utils/timelineNavigation';

import { timelineActions } from '../middleware/timeline';
import assetManifest from './protocol/assetManifest';
import codebook from './protocol/codebook';
import { isStageEditorCodebookAction } from './protocol/stageEditorCodebookMeta';
import stages from './protocol/stages';

// Types
type ActiveProtocolState = CurrentProtocol | null;

const initialState = null as ActiveProtocolState;

const activeProtocolSlice = createSlice({
  name: 'activeProtocol',
  initialState,
  reducers: {
    setActiveProtocol: (_state, action: PayloadAction<CurrentProtocol>) => {
      // Replace the entire state with the new protocol
      return action.payload;
    },
    updateProtocol: (
      state,
      action: PayloadAction<Partial<CurrentProtocol>>,
    ) => {
      if (!state) return state;
      return {
        ...state,
        ...action.payload,
      };
    },
    updateProtocolDescription: (
      state,
      action: PayloadAction<{ description?: string }>,
    ) => {
      if (!state) return state;
      return { ...state, description: action.payload.description };
    },
    updateProtocolName: (state, action: PayloadAction<{ name: string }>) => {
      if (!state) return state;
      return { ...state, name: action.payload.name };
    },
    updateLastModified: (state, action: PayloadAction<string>) => {
      if (!state) return state;
      return { ...state, lastModified: action.payload };
    },
    clearActiveProtocol: (_state) => {
      // Assets are namespaced per protocol and owned by the library; deleting a
      // protocol (deleteLibraryProtocol) removes its assets. Closing the active
      // protocol must NOT clear the shared asset store.
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder.addDefaultCase((state, action: UnknownAction) => {
      if (!state) return state;

      // Apply sub-reducers to specific parts of the state.
      // Mutate the draft only when the sub-reducer produces a new reference.
      // Immer will automatically produce a new top-level reference from any mutations.
      if (state.stages) {
        const currentStages = current(state.stages);
        const newStages = stages(currentStages, action);
        if (newStages !== currentStages) {
          state.stages = newStages as typeof state.stages;
        }
      }

      const shouldHandleAssetManifest =
        state.assetManifest !== undefined && state.assetManifest !== null
          ? true
          : typeof action.type === 'string' &&
            action.type.startsWith('assetManifest/');
      if (shouldHandleAssetManifest) {
        const currentAssetManifest = state.assetManifest
          ? (current(state.assetManifest) as Parameters<
              typeof assetManifest
            >[0])
          : undefined;
        const newAssetManifest = assetManifest(currentAssetManifest, action);
        if (newAssetManifest !== currentAssetManifest) {
          state.assetManifest = newAssetManifest as typeof state.assetManifest;
        }
      }

      // A codebook write made inside an open stage editor belongs to that
      // editor's draft copy, not to the canonical protocol — it must not reach
      // validation or persistence until the stage is committed (#1382).
      if (state.codebook && !isStageEditorCodebookAction(action)) {
        const currentCodebook = current(state.codebook);
        const newCodebook = codebook(currentCodebook, action);
        if (newCodebook !== currentCodebook) {
          state.codebook = newCodebook;
        }
      }
    });
  },
});

// Extract actions and selectors
export const setActiveProtocol = activeProtocolSlice.actions.setActiveProtocol;
export const updateProtocolDescription =
  activeProtocolSlice.actions.updateProtocolDescription;
export const updateProtocolName =
  activeProtocolSlice.actions.updateProtocolName;
export const updateLastModified =
  activeProtocolSlice.actions.updateLastModified;
export const clearActiveProtocol =
  activeProtocolSlice.actions.clearActiveProtocol;

export const actionCreators = {
  setActiveProtocol: activeProtocolSlice.actions.setActiveProtocol,
  updateProtocol: activeProtocolSlice.actions.updateProtocol,
  updateProtocolDescription:
    activeProtocolSlice.actions.updateProtocolDescription,
  updateProtocolName: activeProtocolSlice.actions.updateProtocolName,
  updateLastModified: activeProtocolSlice.actions.updateLastModified,
  clearActiveProtocol: activeProtocolSlice.actions.clearActiveProtocol,
};

// Export the reducer as default
export default activeProtocolSlice.reducer;

const currentPath = () =>
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : '';

/**
 * What one activation of the history controls actually did, so the caller can
 * describe it without re-deriving state that has already moved.
 */
export type TimelineOperationOutcome = {
  applied: boolean;
  /** The page the researcher was moved to, or null if they stayed put. */
  navigatedTo: string | null;
};

const NOT_APPLIED: TimelineOperationOutcome = {
  applied: false,
  navigatedTo: null,
};

// User-facing undo/redo. One activation always performs one history operation,
// from whichever page the controls are on (#1389). The route only changes when
// it is needed to reveal the result — `resolveTimelineNavTarget` owns that
// decision — so a change recorded on another page that hosts the controls is
// applied AND brought into view in the same activation, while same-page,
// experiments, Summary and legacy (path-less) entries apply in place without
// moving the researcher.
export const undoWithNavigation =
  () =>
  (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): TimelineOperationOutcome => {
    const state = getState();
    if (!getCanUndo(state)) return NOT_APPLIED;

    // Resolve the destination before dispatching — undo pops the very entry
    // whose recorded page we need.
    const targetPage = resolveTimelineNavTarget(
      getUndoTargetPath(state),
      currentPath(),
    );
    const previousProtocol = getProtocol(state);

    dispatch(timelineActions.undo());

    // Confirm from state rather than trusting the pre-flight check, so a
    // reducer that refuses can never be reported (or announced) as applied.
    if (getProtocol(getState()) === previousProtocol) {
      return NOT_APPLIED;
    }

    const navigatedTo = targetPage || null;
    if (navigatedTo) navigate(navigatedTo);

    return { applied: true, navigatedTo };
  };

export const redoWithNavigation =
  () =>
  (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): TimelineOperationOutcome => {
    const state = getState();
    if (!getCanRedo(state)) return NOT_APPLIED;

    const targetPage = resolveTimelineNavTarget(
      getRedoTargetPath(state),
      currentPath(),
    );
    const previousProtocol = getProtocol(state);

    dispatch(timelineActions.redo());

    if (getProtocol(getState()) === previousProtocol) {
      return NOT_APPLIED;
    }

    const navigatedTo = targetPage || null;
    if (navigatedTo) navigate(navigatedTo);

    return { applied: true, navigatedTo };
  };
