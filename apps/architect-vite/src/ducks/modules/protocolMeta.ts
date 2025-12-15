import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

// Types
type ProtocolMetaState = {
	name: string;
} | null;

const initialState: ProtocolMetaState = null;

const protocolMetaSlice = createSlice({
	name: "protocolMeta",
	initialState: initialState as ProtocolMetaState,
	reducers: {
		setProtocolMeta: (_state, action: PayloadAction<{ name: string }>): ProtocolMetaState => {
			return {
				name: action.payload.name,
			};
		},
		updateProtocolMeta: (state, action: PayloadAction<Partial<NonNullable<ProtocolMetaState>>>): ProtocolMetaState => {
			if (!state) return state;
			return { ...state, ...action.payload };
		},
		clearProtocolMeta: (): ProtocolMetaState => null,
	},
});

export const { setProtocolMeta, clearProtocolMeta } = protocolMetaSlice.actions;

export default protocolMetaSlice.reducer;
