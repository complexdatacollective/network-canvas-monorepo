import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type PreviewStatus = "idle" | "uploading" | "ready" | "error";

export type PreviewState = {
	status: PreviewStatus;
	url: string | null;
	error: string | null;
	lastUploadedAt: number | null;
	lastUploadedHash: string | null;
};

const initialState: PreviewState = {
	status: "idle",
	url: null,
	error: null,
	lastUploadedAt: null,
	lastUploadedHash: null,
};

const previewSlice = createSlice({
	name: "preview",
	initialState,
	reducers: {
		previewUploadStarted(state, _action: PayloadAction<{ hash: string }>) {
			state.status = "uploading";
			state.error = null;
		},
		previewUploadSucceeded(state, action: PayloadAction<{ url: string; hash: string; at: number }>) {
			state.status = "ready";
			state.url = action.payload.url;
			state.lastUploadedAt = action.payload.at;
			state.lastUploadedHash = action.payload.hash;
			state.error = null;
		},
		previewUploadFailed(state, action: PayloadAction<{ error: string }>) {
			state.status = "error";
			state.error = action.payload.error;
		},
		previewReset() {
			return initialState;
		},
	},
});

export const { previewUploadStarted, previewUploadSucceeded, previewUploadFailed, previewReset } = previewSlice.actions;

export default previewSlice.reducer;
