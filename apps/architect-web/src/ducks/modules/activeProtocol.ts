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
  getRedoTargetPath,
  getUndoTargetPath,
} from '~/selectors/protocol';
import { resolveTimelineNavTarget } from '~/utils/timelineNavigation';

import { timelineActions } from '../middleware/timeline';
import assetManifest from './protocol/assetManifest';
import codebook from './protocol/codebook';
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

      if (state.codebook) {
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

// Raw timeline operations. These apply silently and are used by the protocol
// validation listener's auto-revert; do not navigate from here. `undo` is
// exported for the listener; `redo` is only used internally below.
export const undo = () => (dispatch: AppDispatch) => {
  dispatch(timelineActions.undo());
};

const redo = () => (dispatch: AppDispatch) => {
  dispatch(timelineActions.redo());
};

const currentPath = () =>
  typeof window !== 'undefined' && window.location
    ? window.location.pathname
    : '';

// User-facing undo/redo. Navigation is a discrete, visible step: when the
// change to be undone/redone was committed on another page, the first press
// just navigates there (so the change is reverted in view, never off-screen)
// and the next press applies it. Committed stage edits resolve to the stage
// list rather than re-opening the editor (see resolveTimelineNavTarget). Same-
// page and legacy (path-less) entries apply in place.
export const undoWithNavigation =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    if (!getCanUndo(state)) return;

    const targetPage = resolveTimelineNavTarget(getUndoTargetPath(state));
    if (targetPage && targetPage !== currentPath()) {
      navigate(targetPage);
      return;
    }

    dispatch(undo());
  };

export const redoWithNavigation =
  () => (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState();
    if (!getCanRedo(state)) return;

    const targetPage = resolveTimelineNavTarget(getRedoTargetPath(state));
    if (targetPage && targetPage !== currentPath()) {
      navigate(targetPage);
      return;
    }

    dispatch(redo());
  };
