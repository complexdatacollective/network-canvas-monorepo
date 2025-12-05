import type { CurrentProtocol } from "@codaco/protocol-validation";
import { createSlice, current, type PayloadAction, type UnknownAction } from "@reduxjs/toolkit";
import { pick } from "es-toolkit/compat";
import type { AppDispatch } from "~/ducks/store";
import { assetDb } from "~/utils/assetDB";
import { timelineActions } from "../middleware/timeline";
import assetManifest from "./protocol/assetManifest";
import codebook from "./protocol/codebook";
import stages from "./protocol/stages";

// Types
type ActiveProtocolState =
	| (CurrentProtocol & {
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
		setActiveProtocol: (_state, action: PayloadAction<CurrentProtocol & { name: string }>) => {
			// Replace the entire state with the new protocol
			return {
				...action.payload,
				isValid: true, // Assume new protocol is valid initially
				lastSavedAt: null,
				lastSavedTimeline: null,
			} as ActiveProtocolState;
		},
		updateProtocol: (state, action: PayloadAction<Partial<ActiveProtocolState>>) => {
			if (!state) return state;
			return {
				...state,
				...action.payload,
			} as ActiveProtocolState;
		},
		updateProtocolOptions: (state, action: PayloadAction<{ name?: string; description?: string }>) => {
			if (!state) return state;
			return {
				...state,
				...pick(action.payload, ["name", "description"]),
			} as ActiveProtocolState;
		},
		markProtocolSaved: (state, action: PayloadAction<{ timestamp: number; timelineLocus: string }>) => {
			if (state) {
				state.lastSavedAt = action.payload.timestamp;
				state.lastSavedTimeline = action.payload.timelineLocus;
			}
		},
		clearActiveProtocol: (_state) => {
			assetDb.assets.clear(); // Clear asset database
			return initialState;
		},
	},
	extraReducers: (builder) => {
		builder.addDefaultCase((state, action: UnknownAction) => {
			if (!state) return state;

			// Apply sub-reducers to specific parts of the state
			// Track if any sub-reducer made a change
			let hasChange = false;

			if (state.stages) {
				// Use current() to get non-draft value before calling sub-reducer
				// This ensures the sub-reducer's Immer context works correctly and can detect changes
				const currentStages = current(state.stages);
				const newStages = stages(currentStages, action);

				// If the sub-reducer returns a different reference, it made a change
				if (newStages !== currentStages) {
					// Cast the stages to the correct type
					state.stages = newStages as typeof state.stages;
					hasChange = true;
				}
			}
			if (state.assetManifest) {
				const currentAssetManifest = current(state.assetManifest);
				const newAssetManifest = assetManifest(currentAssetManifest, action);
				if (newAssetManifest !== currentAssetManifest) {
					// Cast the assetManifest to the correct type
					state.assetManifest = newAssetManifest;
					hasChange = true;
				}
			}
			if (state.codebook) {
				const currentCodebook = current(state.codebook);
				const newCodebook = codebook(currentCodebook, action);
				if (newCodebook !== currentCodebook) {
					// Cast the codebook to the correct type
					state.codebook = newCodebook;
					hasChange = true;
				}
			}

			// If any sub-reducer made a change, ensure we return a new reference
			// This is critical for the timeline middleware to detect changes
			if (hasChange) {
				// Force a new object reference by spreading
				return { ...state } as ActiveProtocolState;
			}
		});
	},
});

// Extract actions and selectors
export const setActiveProtocol = activeProtocolSlice.actions.setActiveProtocol;
export const updateProtocolOptions = activeProtocolSlice.actions.updateProtocolOptions;
export const markProtocolSaved = activeProtocolSlice.actions.markProtocolSaved;
export const clearActiveProtocol = activeProtocolSlice.actions.clearActiveProtocol;

export const actionCreators = {
	setActiveProtocol: activeProtocolSlice.actions.setActiveProtocol,
	updateProtocol: activeProtocolSlice.actions.updateProtocol,
	updateProtocolOptions: activeProtocolSlice.actions.updateProtocolOptions,
	markProtocolSaved: activeProtocolSlice.actions.markProtocolSaved,
	clearActiveProtocol: activeProtocolSlice.actions.clearActiveProtocol,
};

// Export the reducer as default
export default activeProtocolSlice.reducer;

export const undo = () => (dispatch: AppDispatch) => {
	dispatch(timelineActions.undo());
};

export const redo = () => (dispatch: AppDispatch) => {
	dispatch(timelineActions.redo());
};
