import type { CurrentProtocol } from "@codaco/protocol-validation";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "./root";

// TODO: This is a stub implementation - needs full implementation
// This file was created to fix TypeScript import errors

export type StoredProtocol = {
	id: string;
	protocol: CurrentProtocol;
	name: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
	lastModified: number;
};

type ProtocolsState = Record<string, StoredProtocol>;

const initialState: ProtocolsState = {};

const protocolsSlice = createSlice({
	name: "protocols",
	initialState,
	reducers: {
		addProtocol: (
			state,
			action: PayloadAction<{
				id?: string;
				protocol: CurrentProtocol;
				name: string;
				description?: string;
			}>,
		) => {
			const id = action.payload.id || crypto.randomUUID();
			const now = Date.now();
			state[id] = {
				id,
				protocol: action.payload.protocol,
				name: action.payload.name,
				description: action.payload.description,
				createdAt: now,
				updatedAt: now,
				lastModified: now,
			};
		},
		updateProtocol: (state, action: PayloadAction<{ id?: string; protocol: CurrentProtocol }>) => {
			// If no id provided, assume single protocol mode (use first protocol)
			const id = action.payload.id || Object.keys(state)[0];
			if (id && state[id]) {
				state[id].protocol = action.payload.protocol;
				state[id].updatedAt = Date.now();
				state[id].lastModified = Date.now();
			}
		},
		updateProtocolMetadata: (state, action: PayloadAction<{ id?: string; name?: string; description?: string }>) => {
			const id = action.payload.id || Object.keys(state)[0];
			if (id && state[id]) {
				if (action.payload.name !== undefined) {
					state[id].name = action.payload.name;
				}
				if (action.payload.description !== undefined) {
					state[id].description = action.payload.description;
				}
				state[id].updatedAt = Date.now();
			}
		},
		removeProtocol: (state, action: PayloadAction<string | undefined>) => {
			const id = action.payload || Object.keys(state)[0];
			if (id && state[id]) {
				delete state[id];
			}
		},
	},
});

export const { addProtocol, updateProtocol, updateProtocolMetadata, removeProtocol } = protocolsSlice.actions;

// Selectors
export const selectAllProtocols = (state: RootState): StoredProtocol[] => {
	const protocols = state.protocols || {};
	return Object.values(protocols).sort((a, b) => b.lastModified - a.lastModified);
};

export const selectProtocolById = (id: string) => (state: RootState) => {
	return state.protocols?.[id];
};

export const selectRecentProtocols = (limit: number) => (state: RootState) => {
	return selectAllProtocols(state).slice(0, limit);
};

export const selectProtocolExists = (id: string) => (state: RootState) => {
	return !!state.protocols?.[id];
};

export default protocolsSlice.reducer;
