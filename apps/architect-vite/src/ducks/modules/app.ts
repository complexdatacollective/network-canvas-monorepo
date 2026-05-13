import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { get } from "es-toolkit/compat";
import type { RootState } from "./root";

type AppState = {
	[key: string]: unknown;
};

const initialState: AppState = {};

const appSlice = createSlice({
	name: "app",
	initialState,
	reducers: {
		setProperty: (state, action: PayloadAction<{ key: string; value: unknown }>) => {
			const { key, value } = action.payload;
			state[key] = value;
		},
		clearProperty: (state, action: PayloadAction<{ key: string }>) => {
			const { key } = action.payload;
			delete state[key];
		},
	},
});

const { setProperty, clearProperty } = appSlice.actions;

const PREVIEW_USE_SYNTHETIC_DATA_KEY = "previewUseSyntheticData";

export function setPreviewUseSyntheticData(value: boolean) {
	return setProperty({ key: PREVIEW_USE_SYNTHETIC_DATA_KEY, value });
}

export function getPreviewUseSyntheticData(state: RootState): boolean {
	const raw = get(state, ["app", PREVIEW_USE_SYNTHETIC_DATA_KEY]);
	return raw === undefined ? true : Boolean(raw);
}

export { clearProperty, setProperty };
export default appSlice.reducer;
