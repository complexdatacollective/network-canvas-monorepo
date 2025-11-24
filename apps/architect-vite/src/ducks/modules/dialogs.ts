import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ReactNode } from "react";
import { v4 as uuid } from "uuid";

// Define dialog types
type BaseDialog = {
	id: string;
	title: string;
	message?: ReactNode;
	onConfirm?: () => void;
	onCancel?: () => void;
};

interface ConfirmDialog extends BaseDialog {
	type: "Confirm";
	confirmLabel?: string;
}

interface NoticeDialog extends BaseDialog {
	type: "Notice";
	confirmLabel?: string;
}

interface WarningDialog extends BaseDialog {
	type: "Warning";
	confirmLabel?: string;
}

interface ErrorDialog extends Omit<BaseDialog, "title" | "message"> {
	type: "Error";
	error: Error;
}

type Dialog = ConfirmDialog | NoticeDialog | WarningDialog | ErrorDialog;

type DialogsState = {
	dialogs: Dialog[];
};

const initialState: DialogsState = {
	dialogs: [],
};

// Type for dialog config when opening dialogs
export type DialogConfig =
	| (Omit<ConfirmDialog, "id" | "onConfirm" | "onCancel"> & {
			onConfirm?: () => void;
			onCancel?: () => void;
	  })
	| (Omit<NoticeDialog, "id" | "onConfirm" | "onCancel"> & {
			onConfirm?: () => void;
			onCancel?: () => void;
	  })
	| (Omit<WarningDialog, "id" | "onConfirm" | "onCancel"> & {
			onConfirm?: () => void;
			onCancel?: () => void;
	  })
	| (Omit<ErrorDialog, "id" | "onConfirm" | "onCancel"> & {
			onConfirm?: () => void;
			onCancel?: () => void;
	  });

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
