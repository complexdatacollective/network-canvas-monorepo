import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import { omit } from "es-toolkit/compat";
import { v4 as uuid } from "uuid";
import path from "node:path";
import { importAssetErrorDialog, invalidAssetErrorDialog } from "~/ducks/modules/protocol/utils/dialogs";
import { importAsset as fsImportAsset } from "~/utils/protocols";
import { validateAsset } from "~/utils/protocols/assetTools";

// Types
type AssetType = "video" | "audio" | "image" | "network" | "geojson" | "apikey";

type Asset = {
	id: string;
	type: AssetType;
	name: string;
	source?: string;
	value?: string; // For API keys
};

type AssetManifestState = Record<string, Asset>;

type ImportAssetCompletePayload = {
	id: string;
	filename: string;
	name: string;
	assetType: AssetType;
};

type ImportAssetFailedPayload = {
	filename: string;
	error: Error;
};

type AddApiKeyAssetPayload = {
	id: string;
	name: string;
	value: string;
};

// Helper function
const getNameFromFilename = (filename: string) => path.parse(filename).base;

// Async thunks
export const importAssetAsync = createAsyncThunk(
	"assetManifest/importAssetAsync",
	async (filePath: string, { dispatch, getState, rejectWithValue }) => {
		const name = getNameFromFilename(filePath);

		dispatch(assetManifestSlice.actions.importAsset(name));

		// Note: In the original code, workingPath was always null
		// This suggests the asset import functionality may not be fully implemented
		const workingPath = null;

		if (!workingPath) {
			const error = new Error("No working path found, possibly no active protocol.");
			dispatch(assetManifestSlice.actions.importAssetFailed({ filename: filePath, error }));
			dispatch(importAssetErrorDialog(error, filePath));
			return rejectWithValue(error.message);
		}

		try {
			// Validate asset
			await validateAsset(filePath).catch((error) => {
				dispatch(invalidAssetErrorDialog(error, filePath));
				console.error("Validation error", error);
				throw error;
			});

			// Import asset
			const result = await fsImportAsset(workingPath, filePath).catch((error) => {
				console.error("Import error", error);
				dispatch(importAssetErrorDialog(error, filePath));
				throw error;
			});

			console.info("Asset import OK");

			const importPayload: ImportAssetCompletePayload = {
				id: uuid(),
				filename: result.filePath,
				name,
				assetType: result.assetType,
			};

			dispatch(assetManifestSlice.actions.importAssetComplete(importPayload));
			return importPayload;
		} catch (error) {
			const errorPayload = { filename: filePath, error: error as Error };
			dispatch(assetManifestSlice.actions.importAssetFailed(errorPayload));
			return rejectWithValue((error as Error).message);
		}
	},
);

// Initial state
const initialState: AssetManifestState = {};

// Asset manifest slice
const assetManifestSlice = createSlice({
	name: "assetManifest",
	initialState,
	reducers: {
		importAsset: (_state, _action: PayloadAction<string>) => {
			// This is just a loading state action - no state change needed
			// Could be used to track loading states in the future
		},
		importAssetComplete: (state, action: PayloadAction<ImportAssetCompletePayload>) => {
			const { id, filename, name, assetType } = action.payload;
			state[id] = {
				id,
				type: assetType,
				name,
				source: filename,
			};
		},
		importAssetFailed: (_state, action: PayloadAction<ImportAssetFailedPayload>) => {
			// Could be used to track error states in the future
			console.error("Asset import failed:", action.payload.error);
		},
		deleteAsset: (state, action: PayloadAction<string>) => {
			const assetId = action.payload;
			// Don't delete from disk, this allows us to rollback the protocol.
			// Disk changes should be committed on save.
			return omit(state, assetId);
		},
		addApiKeyAsset: (state, action: PayloadAction<AddApiKeyAssetPayload>) => {
			const { id, name, value } = action.payload;
			state[id] = {
				id,
				type: "apikey",
				name,
				value,
			};
		},
	},
});

// Export actions
export const { importAsset, importAssetComplete, importAssetFailed, deleteAsset, addApiKeyAsset } =
	assetManifestSlice.actions;

// Export action creators
export const actionCreators = {
	importAsset: importAssetAsync,
	deleteAsset: (id: string) => assetManifestSlice.actions.deleteAsset(id),
	addApiKeyAsset: (name: string, value: string) => {
		const id = uuid();
		return assetManifestSlice.actions.addApiKeyAsset({ id, name, value });
	},
};

// Export for backwards compatibility and testing
export const test = {
	importAssetComplete: (filename: string, name: string, assetType: AssetType) => {
		const id = uuid();
		return assetManifestSlice.actions.importAssetComplete({ id, filename, name, assetType });
	},
	deleteAsset: (id: string) => assetManifestSlice.actions.deleteAsset(id),
	addApiKeyAsset: (name: string, value: string) => {
		const id = uuid();
		return assetManifestSlice.actions.addApiKeyAsset({ id, name, value });
	},
};

// Export types
export type { Asset, AssetManifestState, AssetType };

// Export the reducer as default
export default assetManifestSlice.reducer;
