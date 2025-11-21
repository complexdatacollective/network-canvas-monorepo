import type { CurrentProtocol } from "@codaco/protocol-validation";
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
				const newAssetManifest = assetManifest(currentAssetManifest as Record<string, unknown>, action);
				if (newAssetManifest !== currentAssetManifest) {
					// Cast the assetManifest to the correct type
					state.assetManifest = newAssetManifest as typeof state.assetManifest;
					hasChange = true;
				}
			}
			if (state.codebook) {
				const currentCodebook = current(state.codebook);
				const newCodebook = codebook(currentCodebook as Record<string, unknown>, action);
				if (newCodebook !== currentCodebook) {
					// Cast the codebook to the correct type
					state.codebook = newCodebook as typeof state.codebook;
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
export const updateProtocol = activeProtocolSlice.actions.updateProtocol;
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

// Export a custom selector that properly handles the TimelineState wrapping in RootState
export const selectActiveProtocol = (state: RootState) => {
	// The activeProtocol in RootState is wrapped by the timeline middleware
	// We need to extract the present value
	const timelineState = state.activeProtocol;

	if (timelineState && typeof timelineState === "object" && "present" in timelineState) {
		return (timelineState as unknown as { present: ActiveProtocolState }).present ?? null;
	}

	// Fallback for raw state (shouldn't happen in normal operation)
	return (timelineState as unknown as ActiveProtocolState) ?? null;
};

// Export the reducer as default
export default activeProtocolSlice.reducer;

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
