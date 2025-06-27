import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Protocol } from "@codaco/protocol-validation";
import { pick } from "es-toolkit/compat";
import assetManifest from "./protocol/assetManifest";
import codebook from "./protocol/codebook";
import stages from "./protocol/utils/stages";
import { saveableChange } from "./saveableChange";

// The activeProtocol state should just contain the protocol data
// The ID is available from the URL, so we don't need to store it here
type ActiveProtocolState = Protocol;

const initialState: ActiveProtocolState = {} as ActiveProtocolState;

// Enhanced active protocol slice with all necessary actions
const activeProtocolSlice = createSlice({
	name: "activeProtocol",
	initialState,
	reducers: {
		setActiveProtocol: (state, action: PayloadAction<Protocol>) => {
			// Just set the protocol data - no need for ID
			return action.payload;
		},
		updateProtocol: (state, action: PayloadAction<Partial<Protocol>>) => {
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
		clearActiveProtocol: () => {
			return initialState;
		},
		// Legacy actions for backward compatibility
		legacySetProtocol: (state, action: PayloadAction<{ meta?: unknown; protocol: Protocol }>) => {
			return action.payload.protocol;
		},
		legacyUpdateOptions: (state, action: PayloadAction<{ options: { name?: string; description?: string } }>) => {
			return {
				...state,
				...pick(action.payload.options, ["name", "description"]),
			};
		},
	},
	extraReducers: (builder) => {
		// Handle session actions from other modules for backward compatibility
		builder.addCase("SESSION/RESET_SESSION" as any, () => {
			return initialState;
		});
		builder.addCase("SESSION/OPEN_NETCANVAS_SUCCESS" as any, (state, action: any) => {
			return action.payload.protocol;
		});
		// Handle legacy protocol actions
		builder.addCase("PROTOCOL/SET" as any, (state, action: any) => {
			return action.protocol;
		});
		builder.addCase("PROTOCOL/UPDATE_OPTIONS" as any, (state, action: any) => {
			return {
				...state,
				...pick(action.options, ["name", "description"]),
			};
		});
	},
});

// Extract actions from enhanced slice
const {
	setActiveProtocol,
	updateProtocol,
	updateProtocolOptions: updateProtocolOptionsAction,
	clearActiveProtocol,
	legacySetProtocol,
	legacyUpdateOptions,
} = activeProtocolSlice.actions;

// Utility function to combine multiple reducers (preserving the original pattern)
const reduceReducers =
	<T>(...reducers: Array<(state: T, action: any) => T>) =>
	(previousState: T, action: any): T =>
		reducers.reduce((state, reducer) => reducer(state, action), previousState);

// Create the main active protocol reducer function
const activeProtocolReducer = (state: ActiveProtocolState = initialState, action: any): ActiveProtocolState => {
	return activeProtocolSlice.reducer(state, action);
};

// Export the combined reducer with sub-reducers (maintaining the original structure)
export default reduceReducers(activeProtocolReducer, (state: ActiveProtocolState, action: any) => {
	// Only process sub-reducers if we have protocol data
	if (!state.name && !state.stages && !state.codebook) return state;

	const updatedState = {
		...state,
		stages: stages(state.stages, action),
		codebook: codebook(state.codebook, action),
		assetManifest: assetManifest(state.assetManifest, action),
	};

	return updatedState;
});

// Legacy action creators for backward compatibility
const updateOptionsLegacy = (options: { name?: string; description?: string }) => ({
	type: "PROTOCOL/UPDATE_OPTIONS",
	options,
});

const setProtocolLegacy = (meta: unknown, protocol: Protocol) => ({
	type: "PROTOCOL/SET",
	meta,
	protocol,
});

// Modern RTK action creators
const updateProtocolOptions = (options: { name?: string; description?: string }) =>
	updateProtocolOptionsAction(options);

const setProtocol = (meta: unknown, protocol: Protocol) => legacySetProtocol({ meta, protocol });

// Export action creators with both legacy and modern versions
export const actionCreators = {
	// Modern RTK actions (preferred)
	setActiveProtocol,
	updateProtocol,
	updateProtocolOptions: saveableChange(updateProtocolOptions),
	clearActiveProtocol,
	// Legacy actions for backward compatibility - keeping same names for now
	updateOptions: saveableChange(updateProtocolOptions),
	setProtocol,
	resetSession: clearActiveProtocol,
	// Legacy actions with explicit names
	updateOptionsLegacy: saveableChange(updateOptionsLegacy),
	setProtocolLegacy,
};

export const actionTypes = {
	// Modern RTK action types (preferred)
	SET_ACTIVE_PROTOCOL: "activeProtocol/setActiveProtocol",
	UPDATE_PROTOCOL: "activeProtocol/updateProtocol",
	UPDATE_PROTOCOL_OPTIONS: "activeProtocol/updateProtocolOptions",
	CLEAR_ACTIVE_PROTOCOL: "activeProtocol/clearActiveProtocol",
	// Legacy action types for backward compatibility
	UPDATE_OPTIONS: "activeProtocol/updateProtocolOptions",
	SET_PROTOCOL: "activeProtocol/legacySetProtocol",
	RESET_SESSION: "activeProtocol/clearActiveProtocol",
	UPDATE_OPTIONS_LEGACY: "PROTOCOL/UPDATE_OPTIONS",
	SET_PROTOCOL_LEGACY: "PROTOCOL/SET",
};

// Selectors
export const selectActiveProtocol = (state: { activeProtocol: { present: ActiveProtocolState } }): Protocol | null => {
	const protocol = state.activeProtocol.present;
	// Return null if we have an empty state
	if (!protocol || (!protocol.name && !protocol.stages && !protocol.codebook)) {
		return null;
	}

	return protocol;
};

export const selectHasActiveProtocol = (state: { activeProtocol: { present: ActiveProtocolState } }): boolean => {
	const protocol = state.activeProtocol.present;
	return Boolean(protocol && (protocol.name || protocol.stages || protocol.codebook));
};

// Export types for use in other parts of the application
export type { ActiveProtocolState };
