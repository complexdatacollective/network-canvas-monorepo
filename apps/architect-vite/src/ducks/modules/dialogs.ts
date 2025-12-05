import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";
import type { Dialog } from "~/lib/legacy-ui/components/Dialogs";

// Distributive Omit preserves discriminated union behavior
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export type DialogConfig = DistributiveOmit<Dialog, "id">;

type DialogsState = {
	dialogs: Dialog[];
};

const initialState: DialogsState = {
	dialogs: [],
};

// Async thunk for opening dialogs with promise support
export const openDialog = createAsyncThunk<boolean, DialogConfig>(
	"dialogs/openDialog",
	async (dialogConfig, { dispatch }) => {
		return new Promise<boolean>((resolve) => {
			const onConfirm = () => {
				if (dialogConfig.onConfirm) {
					dialogConfig.onConfirm();
				}
				resolve(true);
			};

			const onCancel = () => {
				if (dialogConfig.onCancel) {
					dialogConfig.onCancel();
				}
				resolve(false);
			};

			const id = uuid();
			const dialog: Dialog = {
				...dialogConfig,
				id,
				onConfirm,
				onCancel,
			} as Dialog;

			dispatch(addDialog(dialog));
		});
	},
);

// Create the dialogs slice
const dialogsSlice = createSlice({
	name: "dialogs",
	initialState,
	reducers: {
		addDialog: (state, action: PayloadAction<Dialog>) => {
			state.dialogs.push(action.payload);
		},
		closeDialog: (state, action: PayloadAction<string>) => {
			state.dialogs = state.dialogs.filter((dialog) => dialog.id !== action.payload);
		},
	},
});

// Export the action creators
export const { addDialog, closeDialog } = dialogsSlice.actions;

// Export the reducer as default
export default dialogsSlice.reducer;

// Maintain compatibility with existing code
export const actionCreators = {
	openDialog,
	closeDialog: (id: string) => closeDialog(id),
};
