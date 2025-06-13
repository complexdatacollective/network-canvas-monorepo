import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import { v4 as uuid } from "uuid";

// Define dialog types
interface BaseDialog {
	id: string;
	title: string;
	message?: string;
	onConfirm?: () => void;
	onCancel?: () => void;
}

interface ConfirmDialog extends BaseDialog {
	type: "Confirm";
	confirmLabel?: string;
}

interface NoticeDialog extends BaseDialog {
	type: "Notice";
}

interface WarningDialog extends BaseDialog {
	type: "Warning";
}

interface ErrorDialog extends Omit<BaseDialog, "title" | "message"> {
	type: "Error";
	error: Error;
}

type Dialog = ConfirmDialog | NoticeDialog | WarningDialog | ErrorDialog;

interface DialogsState {
	dialogs: Dialog[];
}

const initialState: DialogsState = {
	dialogs: [],
};

// Async thunk for opening dialogs with promise support
export const openDialog = createAsyncThunk<
	boolean,
	Omit<Dialog, "id" | "onConfirm" | "onCancel"> & {
		onConfirm?: () => void;
		onCancel?: () => void;
	}
>("dialogs/openDialog", async (dialogConfig, { dispatch }) => {
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
});

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

export const actionTypes = {
	OPEN_DIALOG: "dialogs/addDialog",
	CLOSE_DIALOG: "dialogs/closeDialog",
};

// Export types for use in other parts of the application
export type { Dialog, DialogsState, ConfirmDialog, NoticeDialog, WarningDialog, ErrorDialog };