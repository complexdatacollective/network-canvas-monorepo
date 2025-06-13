import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { omit, get } from "lodash";
import type { RootState } from "./root";

// Define the shape of the app state
interface AppState {
	[key: string]: unknown;
}

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

// Export the action creators
export const { setProperty, clearProperty } = appSlice.actions;

// Export the reducer as default
export default appSlice.reducer;

// Selectors (maintaining compatibility with existing code)
const getProperty = (key: string) => (state: RootState) => get(state, ["app", key]);

export const selectors = {
	getProperty,
};

// Action creators (maintaining compatibility with existing code)
export const actionCreators = {
	setProperty: (key: string, value: unknown) => setProperty({ key, value }),
	clearProperty: (key: string) => clearProperty({ key }),
};

// Action types (maintaining compatibility with existing code)
export const actionTypes = {
	SET_PROPERTY: "app/setProperty",
	CLEAR_PROPERTY: "app/clearProperty",
};

// Export types for use in other parts of the application
export type { AppState };