import type { CurrentProtocol } from "@codaco/protocol-validation";
import { createSlice, current, type PayloadAction, type UnknownAction } from "@reduxjs/toolkit";
import type { AppDispatch } from "~/ducks/store";
import { assetDb } from "~/utils/assetDB";
import { timelineActions } from "../middleware/timeline";
import assetManifest from "./protocol/assetManifest";
import codebook from "./protocol/codebook";
import stages from "./protocol/stages";

// Types
type ActiveProtocolState = CurrentProtocol | null;

const initialState = null as ActiveProtocolState;

const activeProtocolSlice = createSlice({
	name: "activeProtocol",
	initialState,
	reducers: {
		setActiveProtocol: (_state, action: PayloadAction<CurrentProtocol>) => {
			// Replace the entire state with the new protocol
			return action.payload;
		},
		updateProtocol: (state, action: PayloadAction<Partial<CurrentProtocol>>) => {
			if (!state) return state;
			return {
				...state,
				...action.payload,
			};
		},
		updateProtocolDescription: (state, action: PayloadAction<{ description?: string }>) => {
			if (!state) return state;
			return { ...state, description: action.payload.description };
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
				// Cast to internal Asset type (has required id) for reducer
				const newAssetManifest = assetManifest(currentAssetManifest as Parameters<typeof assetManifest>[0], action);
				if (newAssetManifest !== currentAssetManifest) {
					// Cast back to protocol Asset type (has optional id)
					state.assetManifest = newAssetManifest as typeof state.assetManifest;
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
export const updateProtocolDescription = activeProtocolSlice.actions.updateProtocolDescription;
export const clearActiveProtocol = activeProtocolSlice.actions.clearActiveProtocol;

export const actionCreators = {
	setActiveProtocol: activeProtocolSlice.actions.setActiveProtocol,
	updateProtocol: activeProtocolSlice.actions.updateProtocol,
	updateProtocolDescription: activeProtocolSlice.actions.updateProtocolDescription,
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
