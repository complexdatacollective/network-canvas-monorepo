import type { Protocol } from "@codaco/protocol-validation";
import { createSlice, type PayloadAction, type UnknownAction } from "@reduxjs/toolkit";
import { pick } from "es-toolkit/compat";
import type { AppDispatch } from "~/ducks/store";
import { assetDb } from "~/utils/assetDB";
import { timelineActions } from "../middleware/timeline";
import assetManifest from "./protocol/assetManifest";
import codebook from "./protocol/codebook";
import stages from "./protocol/stages";
import type { RootState } from "./root";

// Types
type ActiveProtocolState =
	| (Protocol & {
			name: string;
			isValid: boolean;
			lastSavedAt: number | null;
			lastSavedTimeline: string | null;
	  })
	| null;

const initialState: ActiveProtocolState = null as ActiveProtocolState;

// Enhanced active protocol slice with all necessary actions
const activeProtocolSlice = createSlice({
	name: "activeProtocol",
	initialState,
	reducers: {
		setActiveProtocol: (_state, action: PayloadAction<Protocol & { name: string }>) => {
			// Replace the entire state with the new protocol
			return {
				...action.payload,
				isValid: true, // Assume new protocol is valid initially
				lastSavedAt: null,
				lastSavedTimeline: null,
			};
		},
		updateProtocol: (state, action: PayloadAction<Partial<ActiveProtocolState>>) => {
			return {
				...state,
				...action.payload,
			};
		},
		updateProtocolOptions: (state, action: PayloadAction<{ name?: string; description?: string }>) => {
			return {
				...state,
				...pick(action.payload, ["name", "description"]),
			};
		},
		markProtocolSaved: (state, action: PayloadAction<{ timestamp: number; timelineLocus: string }>) => {
			if (state) {
				state.lastSavedAt = action.payload.timestamp;
				state.lastSavedTimeline = action.payload.timelineLocus;
			}
		},
		clearActiveProtocol: (_state, _action: null) => {
			assetDb.assets.clear(); // Clear asset database
			return initialState;
		},
	},
	extraReducers: (builder) => {
		builder.addDefaultCase((state, action: UnknownAction) => {
			// Apply sub-reducers to specific parts of the state
			// This replaces the custom reduceReducers pattern
			if (state?.stages) {
				const newStages = stages(state.stages, action);
				if (newStages) {
					state.stages = newStages;
				}
			}
			if (state?.assetManifest) {
				const newAssetManifest = assetManifest(state.assetManifest, action);
				if (newAssetManifest) {
					state.assetManifest = newAssetManifest;
				}
			}
			if (state?.codebook) {
				const newCodebook = codebook(state.codebook, action);
				if (newCodebook) {
					state.codebook = newCodebook;
				}
			}
		});
	},
	selectors: {
		selectActiveProtocol: (state) => state.present ?? null,
	},
});

// Extract actions and selectors
export const { setActiveProtocol, updateProtocol, updateProtocolOptions, markProtocolSaved, clearActiveProtocol } =
	activeProtocolSlice.actions;
export const { selectActiveProtocol } = activeProtocolSlice.selectors;

// Export the reducer as default
export default activeProtocolSlice.reducer;

// Export types for use in other parts of the application
export type { ActiveProtocolState };

export const getCanUndo = (state: RootState): boolean => {
	const timeline = state.activeProtocol?.timeline || [];
	return timeline.length > 1;
};

export const getCanRedo = (_state: RootState): boolean => {
	// TODO: Implement redo logic
	return false;
};

const getUndoLocus = (state: RootState): string | null => {
	const timeline = state.activeProtocol?.timeline || [];
	if (timeline.length < 2) return null;
	return timeline[timeline.length - 2];
};

export const undo = () => (dispatch: AppDispatch, getState: () => RootState) => {
	const state = getState();
	const undoLocus = getUndoLocus(state);

	if (undoLocus) {
		dispatch(timelineActions.jump(undoLocus));
	} else {
		console.warn("Nothing to undo");
	}
};

export const redo = () => (dispatch: AppDispatch, _getState: () => RootState) => {
	// TODO: Implement redo logic
	console.warn("Redo not implemented");
};
