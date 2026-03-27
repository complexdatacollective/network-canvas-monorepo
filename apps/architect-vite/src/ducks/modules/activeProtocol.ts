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
		updateProtocolName: (state, action: PayloadAction<{ name: string }>) => {
			if (!state) return state;
			return { ...state, name: action.payload.name };
		},
		updateLastModified: (state, action: PayloadAction<string>) => {
			if (!state) return state;
			return { ...state, lastModified: action.payload };
		},
		clearActiveProtocol: (_state) => {
			assetDb.assets.clear(); // Clear asset database
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
					: typeof action.type === "string" && action.type.startsWith("assetManifest/");
			if (shouldHandleAssetManifest) {
				const currentAssetManifest = state.assetManifest
					? (current(state.assetManifest) as Parameters<typeof assetManifest>[0])
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
export const updateProtocolDescription = activeProtocolSlice.actions.updateProtocolDescription;
export const updateProtocolName = activeProtocolSlice.actions.updateProtocolName;
export const updateLastModified = activeProtocolSlice.actions.updateLastModified;
export const clearActiveProtocol = activeProtocolSlice.actions.clearActiveProtocol;

export const actionCreators = {
	setActiveProtocol: activeProtocolSlice.actions.setActiveProtocol,
	updateProtocol: activeProtocolSlice.actions.updateProtocol,
	updateProtocolDescription: activeProtocolSlice.actions.updateProtocolDescription,
	updateProtocolName: activeProtocolSlice.actions.updateProtocolName,
	updateLastModified: activeProtocolSlice.actions.updateLastModified,
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
