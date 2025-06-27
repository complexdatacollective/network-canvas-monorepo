import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Protocol } from "@codaco/protocol-validation";

// Protocol with metadata for storage
interface StoredProtocol {
	id: string; // Hash of the protocol JSON
	protocol: Protocol;
	lastModified: number;
	name: string;
	description?: string;
	createdAt: number;
	updatedAt: number;
}

// State shape - a record of protocols by ID
type ProtocolsState = Record<string, StoredProtocol>;

const initialState: ProtocolsState = {};

// Helper function to generate ID from protocol content
async function generateProtocolId(protocol: Protocol): Promise<string> {
	const protocolString = JSON.stringify(protocol);
	const encoder = new TextEncoder();
	const data = encoder.encode(protocolString);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	return hashHex.substring(0, 16); // Use first 16 chars for shorter IDs
}

const protocolsSlice = createSlice({
	name: "protocols",
	initialState,
	reducers: {
		addProtocol: (
			state,
			action: PayloadAction<{ id: string; protocol: Protocol; name: string; description?: string }>,
		) => {
			const { id, protocol, name, description } = action.payload;
			const now = Date.now();

			state[id] = {
				id,
				protocol,
				name,
				description,
				lastModified: now,
				createdAt: state[id]?.createdAt || now,
				updatedAt: now,
			};
		},
		updateProtocol: (state, action: PayloadAction<{ id: string; protocol: Protocol }>) => {
			const { id, protocol } = action.payload;

			if (state[id]) {
				state[id] = {
					...state[id],
					protocol,
					name: protocol.name || state[id].name,
					description: protocol.description,
					lastModified: Date.now(),
					updatedAt: Date.now(),
				};
			}
		},
		updateProtocolMetadata: (state, action: PayloadAction<{ id: string; name?: string; description?: string }>) => {
			const { id, name, description } = action.payload;

			if (state[id]) {
				if (name !== undefined) state[id].name = name;
				if (description !== undefined) state[id].description = description;
				state[id].lastModified = Date.now();
				state[id].updatedAt = Date.now();
			}
		},
		removeProtocol: (state, action: PayloadAction<string>) => {
			delete state[action.payload];
		},
	},
});

// Export actions
export const { addProtocol, updateProtocol, updateProtocolMetadata, removeProtocol } = protocolsSlice.actions;

// Selectors
export const selectAllProtocols = (state: { protocols: ProtocolsState }) =>
	Object.values(state.protocols).sort((a, b) => b.lastModified - a.lastModified);

export const selectProtocolById = (id: string) => (state: { protocols: ProtocolsState }) => state.protocols[id];

export const selectRecentProtocols =
	(limit = 10) =>
	(state: { protocols: ProtocolsState }) =>
		Object.values(state.protocols)
			.sort((a, b) => b.lastModified - a.lastModified)
			.slice(0, limit);

export const selectProtocolExists = (id: string) => (state: { protocols: ProtocolsState }) =>
	Boolean(state.protocols[id]);

// Export reducer
export default protocolsSlice.reducer;

// Export types
export type { StoredProtocol, ProtocolsState };

// Export helper function
export { generateProtocolId };
