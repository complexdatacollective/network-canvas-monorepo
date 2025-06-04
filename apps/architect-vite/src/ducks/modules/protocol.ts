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

// Create the protocol slice
const protocolSlice = createSlice({
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
	},
});

// Extract actions
const { setProtocol: setProtocolAction, updateOptions: updateOptionsAction, resetSession, openNetcanvasSuccess } = protocolSlice.actions;

// Create the main protocol reducer function
const protocolReducer = (state: ProtocolState = initialState, action: any = {}): ProtocolState => {
	// Handle our slice actions
	if (action.type?.startsWith("protocol/")) {
		return protocolSlice.reducer(state, action);
	}

	// Handle legacy action types for backward compatibility
	switch (action.type) {
		case "SESSION/RESET_SESSION":
			return initialState;
		case "PROTOCOL/SET":
			return { ...action.protocol };
		case "SESSION/OPEN_NETCANVAS_SUCCESS":
			return {
				...action.payload.protocol,
			};
		case "PROTOCOL/UPDATE_OPTIONS":
			return {
				...state,
				...pick(action.options, ["name", "version", "description"]),
			};
		default:
			return state;
	}
};

// Utility function to combine multiple reducers (preserving the original pattern)
const reduceReducers =
	<T,>(...reducers: Array<(state: T, action: any) => T>) =>
	(previousState: T, action: any): T =>
		reducers.reduce((state, reducer) => reducer(state, action), previousState);

// Export the combined reducer with sub-reducers (maintaining the original structure)
export default reduceReducers(protocolReducer, (state: ProtocolState, action: any) => {
	return {
		...state,
		stages: stages(state.stages, action),
		codebook: codebook(state.codebook, action),
		assetManifest: assetManifest(state.assetManifest, action),
	};
});

// Action creators (maintaining compatibility)
const updateOptions = (options: { name?: string; version?: string; description?: string }) => ({
	type: "PROTOCOL/UPDATE_OPTIONS",
	options,
});

const setProtocol = (meta: unknown, protocol: ProtocolState) => ({
	type: "PROTOCOL/SET",
	meta,
	protocol,
});

// Export action creators and types for compatibility
export const actionCreators = {
	updateOptions: saveableChange(updateOptions),
	setProtocol,
	// Also export RTK versions for new code
	updateOptionsRTK: (options: { name?: string; version?: string; description?: string }) => updateOptionsAction(options),
	setProtocolRTK: (meta: unknown, protocol: ProtocolState) => setProtocolAction({ meta, protocol }),
};

export const actionTypes = {
	UPDATE_OPTIONS: "PROTOCOL/UPDATE_OPTIONS",
	SET_PROTOCOL: "PROTOCOL/SET",
	// RTK action types
	UPDATE_OPTIONS_RTK: "protocol/updateOptions",
	SET_PROTOCOL_RTK: "protocol/setProtocol",
};

// Export types for use in other parts of the application
export type { ProtocolState };