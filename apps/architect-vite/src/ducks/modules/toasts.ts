import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";

// Define toast types
type Toast = {
	id: string;
	type?: "success" | "error" | "info" | "warning";
	title?: string;
	message?: string;
	duration?: number;
	autoDismiss?: boolean;
	[key: string]: unknown; // Allow additional properties for flexibility
};

type ToastsState = Toast[];

const initialState: ToastsState = [];

// Async thunk for adding toasts that returns the generated ID (currently unused)
const _addToast = createAsyncThunk<string, Partial<Toast> & { id?: string }>(
	"toasts/addToast",
	async (toastConfig, { dispatch }) => {
		const id = toastConfig.id || uuid();
		const toast: Toast = {
			...toastConfig,
			id,
		};

		dispatch(addToastSync(toast));
		return id;
	},
);

// Create the toasts slice
const toastsSlice = createSlice({
	name: "toasts",
	initialState,
	reducers: {
		addToastSync: (state, action: PayloadAction<Toast>) => {
			state.push(action.payload);
		},
		updateToast: (state, action: PayloadAction<{ id: string; toast: Partial<Toast> }>) => {
			const { id, toast: toastUpdate } = action.payload;
			const index = state.findIndex((toast) => toast.id === id);
			if (index !== -1) {
				state[index] = { ...state[index], ...toastUpdate };
			}
		},
		removeToast: (state, action: PayloadAction<string>) => {
			return state.filter((toast) => toast.id !== action.payload);
		},
	},
});

// Internal action creators (not exported directly)
const { addToastSync, updateToast: _updateToastAction, removeToast: removeToastAction } = toastsSlice.actions;

// Export convenience wrapper with cleaner API (currently only removeToast is used)
export const removeToast = (id: string) => removeToastAction(id);

// Export the reducer as default
export default toastsSlice.reducer;
