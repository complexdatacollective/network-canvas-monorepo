import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Types
export type ProtocolMetaState = {
	name: string;
	lastSavedAt: number | null;
	lastSavedTimeline: string | null;
} | null;

const initialState: ProtocolMetaState = null;

const protocolMetaSlice = createSlice({
	name: "protocolMeta",
	initialState: initialState as ProtocolMetaState,
	reducers: {
		setProtocolMeta: (_state, action: PayloadAction<{ name: string }>): ProtocolMetaState => {
			return {
				name: action.payload.name,
				lastSavedAt: null,
				lastSavedTimeline: null,
			};
		},
		updateProtocolMeta: (
			state,
			action: PayloadAction<Partial<NonNullable<ProtocolMetaState>>>,
		): ProtocolMetaState => {
			if (!state) return state;
			return { ...state, ...action.payload };
		},
		markProtocolSaved: (
			state,
			action: PayloadAction<{ timestamp: number; timelineLocus: string }>,
		): ProtocolMetaState => {
			if (!state) return state;
			return {
				...state,
				lastSavedAt: action.payload.timestamp,
				lastSavedTimeline: action.payload.timelineLocus,
			};
		},
		clearProtocolMeta: (): ProtocolMetaState => null,
	},
});

export const { setProtocolMeta, updateProtocolMeta, markProtocolSaved, clearProtocolMeta } = protocolMetaSlice.actions;

export default protocolMetaSlice.reducer;
