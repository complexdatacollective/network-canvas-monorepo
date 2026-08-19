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
  getCanonicalProtocol,
  getCanRedo,
  getCanUndo,
  getRedoTargetPath,
  getUndoTargetPath,
} from '~/selectors/protocol';
import { resolveTimelineNavTarget } from '~/utils/timelineNavigation';

import { timelineActions } from '../middleware/timeline';
import { getProtocolOwnedHere } from './app';
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
//
// Undo and redo differ only in which end of the history they read, so they are
// two specs over one implementation rather than two copies of it: every guard,
// the confirm-from-state probe and the navigation decision below are shared,
// and a fix to any of them cannot land in one direction and not the other.
type TimelineOperationSpec = {
  /** Whether the history stack has an entry to apply in this direction. */
  canPerform: (state: RootState) => boolean;
  /** The page recorded against the entry about to be applied. */
  getTargetPath: (state: RootState) => string;
  /** The timeline action that applies it. */
  createAction: () => UnknownAction;
};

const performTimelineOperation =
  ({ canPerform, getTargetPath, createAction }: TimelineOperationSpec) =>
  () =>
  (
    dispatch: AppDispatch,
    getState: () => RootState,
  ): TimelineOperationOutcome => {
    const state = getState();
    if (!canPerform(state)) return NOT_APPLIED;
    // A tab that does not own the saved copy cannot persist a history
    // operation: the protocol would visibly rewind and the library write behind
    // it would be dropped (see `protocolValidationListener`). Refuse the whole
    // operation rather than only the move that follows it, so nothing changes
    // on screen and nothing is announced. The controls are not offered there
    // either (`ProjectActions`); this is the enforcement point.
    if (!getProtocolOwnedHere(state)) return NOT_APPLIED;

    // Resolve the destination before dispatching — undo pops the very entry
    // whose recorded page we need.
    const targetPage = resolveTimelineNavTarget(
      getTargetPath(state),
      currentPath(),
    );
    // The CANONICAL protocol, deliberately: the question this probe asks is
    // "did the SAVED protocol change?", and `getProtocol` answers a different
    // one. Since #1382 it is a memoised selector that SYNTHESISES an object
    // while a stage editor's codebook transaction is open, so its answer to
    // `===` is only as good as its cache: reselect 5's `weakMapMemoize` holds
    // every argument it has seen, but a selector reached through a different
    // memoizer — or one whose overlay ever comes to depend on something outside
    // the timeline — would hand back a fresh object for an unchanged protocol,
    // and a refused undo would be reported, and announced, as "Change undone."
    // Reading the raw present has no cache to depend on.
    const previousProtocol = getCanonicalProtocol(state);

    dispatch(createAction());

    // Confirm from state rather than trusting the pre-flight check, so a
    // reducer that refuses can never be reported (or announced) as applied.
    if (getCanonicalProtocol(getState()) === previousProtocol) {
      return NOT_APPLIED;
    }

    const navigatedTo = targetPage || null;
    if (navigatedTo) navigate(navigatedTo);

    return { applied: true, navigatedTo };
  };

export const undoWithNavigation = performTimelineOperation({
  canPerform: getCanUndo,
  getTargetPath: getUndoTargetPath,
  createAction: timelineActions.undo,
});

export const redoWithNavigation = performTimelineOperation({
  canPerform: getCanRedo,
  getTargetPath: getRedoTargetPath,
  createAction: timelineActions.redo,
});
