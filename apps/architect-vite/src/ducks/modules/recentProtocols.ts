import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { uniqBy } from "es-toolkit/compat";

interface Protocol {
	lastModified: number;
	name: string;
	description: string;
	schemaVersion: string;
	filePath: string;
}

interface RecentProtocol {
	protocol: Protocol;
	lastModified: number;
	name: string;
	description: string;
	schemaVersion: string;
	filePath: string;
}

interface OpenNetCanvasSuccessPayload {
	protocol: Protocol;
}

interface OpenNetCanvasErrorPayload {
	filePath: string;
}

type RecentProtocolsState = RecentProtocol[];

const initialState: RecentProtocolsState = [];

const addProtocol = (state: RecentProtocol[], protocol: RecentProtocol): RecentProtocol[] =>
	uniqBy([protocol, ...state], "filePath")
		.sort((a, b) => b.lastModified - a.lastModified)
		.slice(0, 50);

const recentProtocolsSlice = createSlice({
	name: "recentProtocols",
	initialState,
	reducers: {
		openNetCanvasSuccess: (state, action: PayloadAction<OpenNetCanvasSuccessPayload>) => {
			const { protocol } = action.payload;
			const recentProtocol: RecentProtocol = {
				protocol,
				lastModified: protocol.lastModified,
				name: protocol.name,
				description: protocol.description,
				schemaVersion: protocol.schemaVersion,
				filePath: protocol.filePath,
			};
			return addProtocol(state, recentProtocol);
		},
		openNetCanvasError: (state, action: PayloadAction<OpenNetCanvasErrorPayload>) => {
			return state.filter((protocol) => protocol.filePath !== action.payload.filePath);
		},
	},
});

export const { openNetCanvasSuccess, openNetCanvasError } = recentProtocolsSlice.actions;
export default recentProtocolsSlice.reducer;

// Export types for use in other parts of the application
export type { RecentProtocol, Protocol, RecentProtocolsState };
