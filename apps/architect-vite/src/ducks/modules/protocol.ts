import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { pick } from "es-toolkit/compat";
import assetManifest from "./protocol/assetManifest";
import codebook from "./protocol/codebook";
import stages from "./protocol/utils/stages";
import { saveableChange } from "./session";

// Define the shape of the protocol state
interface ProtocolState {
	name?: string;
	version?: string;
	description?: string;
	stages?: unknown[];
	codebook?: unknown;
	assetManifest?: unknown;
	[key: string]: unknown; // Allow for additional protocol properties
}

const initialState: ProtocolState = {};

// Enhanced protocol slice with all necessary actions
const enhancedProtocolSlice = createSlice({
	name: "protocol",
	initialState,
	reducers: {
		setProtocol: (state, action: PayloadAction<{ meta?: unknown; protocol: ProtocolState }>) => {
			return { ...action.payload.protocol };
		},
		updateOptions: (state, action: PayloadAction<{ name?: string; version?: string; description?: string }>) => {
			return {
				...state,
				...pick(action.payload, ["name", "version", "description"]),
			};
		},
		resetSession: () => {
			return initialState;
		},
		openNetcanvasSuccess: (state, action: PayloadAction<{ protocol: ProtocolState }>) => {
			return {
				...action.payload.protocol,
			};
		},
		// Legacy actions for backward compatibility
		legacySet: (state, action: PayloadAction<{ protocol: ProtocolState }>) => {
			return { ...action.payload.protocol };
		},
		legacyUpdateOptions: (
			state,
			action: PayloadAction<{ options: { name?: string; version?: string; description?: string } }>,
		) => {
			return {
				...state,
				...pick(action.payload.options, ["name", "version", "description"]),
			};
		},
	},
	extraReducers: (builder) => {
		// Handle session actions from other modules
		builder.addCase("SESSION/RESET_SESSION" as any, () => {
			return initialState;
		});
		builder.addCase("SESSION/OPEN_NETCANVAS_SUCCESS" as any, (state, action: any) => {
			return {
				...action.payload.protocol,
			};
		});
		// Handle legacy protocol actions
		builder.addCase("PROTOCOL/SET" as any, (state, action: any) => {
			return { ...action.protocol };
		});
		builder.addCase("PROTOCOL/UPDATE_OPTIONS" as any, (state, action: any) => {
			return {
				...state,
				...pick(action.options, ["name", "version", "description"]),
			};
		});
	},
});

// Extract actions from enhanced slice
const {
	setProtocol: setProtocolAction,
	updateOptions: updateOptionsAction,
	resetSession,
	openNetcanvasSuccess,
	legacySet,
	legacyUpdateOptions,
} = enhancedProtocolSlice.actions;

// Utility function to combine multiple reducers (preserving the original pattern)
const reduceReducers =
	<T>(...reducers: Array<(state: T, action: any) => T>) =>
	(previousState: T, action: any): T =>
		reducers.reduce((state, reducer) => reducer(state, action), previousState);

// Create the main protocol reducer function using RTK slice
const protocolReducer = (state: ProtocolState = initialState, action: any): ProtocolState => {
	return enhancedProtocolSlice.reducer(state, action);
};

// Export the combined reducer with sub-reducers (maintaining the original structure)
export default reduceReducers(protocolReducer, (state: ProtocolState, action: any) => {
	return {
		...state,
		stages: stages(state.stages, action),
		codebook: codebook(state.codebook, action),
		assetManifest: assetManifest(state.assetManifest, action),
	};
});

// Legacy action creators for backward compatibility
const updateOptionsLegacy = (options: { name?: string; version?: string; description?: string }) => ({
	type: "PROTOCOL/UPDATE_OPTIONS",
	options,
});

const setProtocolLegacy = (meta: unknown, protocol: ProtocolState) => ({
	type: "PROTOCOL/SET",
	meta,
	protocol,
});

// Modern RTK action creators
const updateOptions = (options: { name?: string; version?: string; description?: string }) =>
	updateOptionsAction(options);

const setProtocol = (meta: unknown, protocol: ProtocolState) => setProtocolAction({ meta, protocol });

// Export action creators with both legacy and modern versions
export const actionCreators = {
	// Modern RTK actions (preferred)
	updateOptions: saveableChange(updateOptions),
	setProtocol,
	resetSession,
	openNetcanvasSuccess,
	// Legacy actions for backward compatibility
	updateOptionsLegacy: saveableChange(updateOptionsLegacy),
	setProtocolLegacy,
};

export const actionTypes = {
	// Modern RTK action types (preferred)
	UPDATE_OPTIONS: "protocol/updateOptions",
	SET_PROTOCOL: "protocol/setProtocol",
	RESET_SESSION: "protocol/resetSession",
	OPEN_NETCANVAS_SUCCESS: "protocol/openNetcanvasSuccess",
	// Legacy action types for backward compatibility
	UPDATE_OPTIONS_LEGACY: "PROTOCOL/UPDATE_OPTIONS",
	SET_PROTOCOL_LEGACY: "PROTOCOL/SET",
};

// Export types for use in other parts of the application
export type { ProtocolState };
