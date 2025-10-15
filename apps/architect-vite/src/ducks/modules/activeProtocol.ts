import type { Protocol } from "@codaco/protocol-validation";
import { createSlice, current, type PayloadAction, type UnknownAction } from "@reduxjs/toolkit";
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
					state.stages = newStages;
					hasChange = true;
				}
			}
			if (state.assetManifest) {
				const currentAssetManifest = current(state.assetManifest);
				const newAssetManifest = assetManifest(currentAssetManifest, action);
				if (newAssetManifest !== currentAssetManifest) {
					state.assetManifest = newAssetManifest;
					hasChange = true;
				}
			}
			if (state.codebook) {
				const currentCodebook = current(state.codebook);
				const newCodebook = codebook(currentCodebook, action);
				if (newCodebook !== currentCodebook) {
					state.codebook = newCodebook;
					hasChange = true;
				}
			}

			// If any sub-reducer made a change, ensure we return a new reference
			// This is critical for the timeline middleware to detect changes
			if (hasChange) {
				// Force a new object reference by spreading
				return { ...state };
			}
		});
	},
	selectors: {
		selectActiveProtocol: (state) => {
			if (state && typeof state === "object" && "present" in state) {
				return (state as { present: ActiveProtocolState }).present ?? null;
			}
			return state;
		},
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
	const past = state.activeProtocol?.past || [];
	if (past.length === 0) return false;

	// Don't allow undo if it would take us back to a null state
	const wouldBePresent = past[past.length - 1];
	return wouldBePresent !== null && wouldBePresent !== undefined;
};

export const getCanRedo = (state: RootState): boolean => {
	const future = state.activeProtocol?.future || [];
	return future.length > 0;
};

export const undo = () => (dispatch: AppDispatch) => {
	dispatch(timelineActions.undo());
};

export const redo = () => (dispatch: AppDispatch) => {
	dispatch(timelineActions.redo());
};
