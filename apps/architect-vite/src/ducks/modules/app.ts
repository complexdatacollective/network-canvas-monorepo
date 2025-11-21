import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { get } from "lodash";
import type { RootState } from "./root";

// Define the shape of the app state
type AppState = {
	[key: string]: unknown;
};

const initialState: AppState = {};

// Create the app slice using RTK
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

// Internal action creators (not exported - app module not currently used)
const { setProperty, clearProperty } = appSlice.actions;

// Selector (internal use only)
const getProperty = (key: string) => (state: RootState) => get(state, ["app", key]);

// Export the reducer as default
export default appSlice.reducer;
