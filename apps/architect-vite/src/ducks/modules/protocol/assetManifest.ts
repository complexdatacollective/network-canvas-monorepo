import type { ExtractedAsset } from "@codaco/protocol-validation";
import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { omit } from "es-toolkit/compat";
import { v4 as uuid } from "uuid";
import { importAssetErrorDialog, invalidAssetErrorDialog } from "~/ducks/modules/protocol/utils/dialogs";
import { saveAssetToDb } from "~/utils/assetUtils";
import { validateAsset } from "~/utils/protocols/assetTools";
import { getSupportedAssetType } from "~/utils/protocols/importAsset";

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

// Async thunks
export const importAssetAsync = createAsyncThunk(
	"assetManifest/importAssetAsync",
	async (file: File, { dispatch, rejectWithValue }) => {
		const name = file.name;
		const assetId = uuid();

		dispatch(assetManifestSlice.actions.importAsset(name));

		try {
			// Validate asset
			await validateAsset(file).catch((error) => {
				dispatch(invalidAssetErrorDialog(error, name));
				throw error;
			});

			// Convert File to Blob and create ExtractedAsset
			const blob = new Blob([file], { type: file.type });
			const asset: ExtractedAsset = {
				id: assetId,
				name: file.name,
				data: blob,
			};

			// Store in IndexedDB
			await saveAssetToDb(asset);

			// Get asset type for manifest
			const assetType = getSupportedAssetType(file.name) as AssetType | false;

			if (!assetType) {
				throw new Error(`Unsupported asset type for file: ${file.name}`);
			}

			const importPayload: ImportAssetCompletePayload = {
				id: assetId,
				filename: file.name, // Used as source in manifest
				name,
				assetType,
			};

			dispatch(assetManifestSlice.actions.importAssetComplete(importPayload));
			return importPayload;
		} catch (error) {
			dispatch(
				assetManifestSlice.actions.importAssetFailed({
					filename: name,
					error: error as Error,
				}),
			);
			// Only show generic import error if it wasn't already handled by validation
			// Validation errors have a `code` property (e.g., "COLUMN_MISMATCHED", "VARIABLE_NAME")
			if (!(error as Error & { code?: string }).code) {
				dispatch(importAssetErrorDialog(error as Error, name));
			}
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
		importAssetFailed: (_state, _action: PayloadAction<ImportAssetFailedPayload>) => {},
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

// Export convenience wrappers with cleaner API
export const deleteAsset = (id: string) => assetManifestSlice.actions.deleteAsset(id);
export const addApiKeyAsset = (name: string, value: string) => {
	const id = uuid();
	return assetManifestSlice.actions.addApiKeyAsset({ id, name, value });
};

// Export for backwards compatibility and testing
export const test = {
	importAssetComplete: (filename: string, name: string, assetType: AssetType, id?: string) => {
		const assetId = id || uuid();
		return assetManifestSlice.actions.importAssetComplete({
			id: assetId,
			filename,
			name,
			assetType,
		});
	},
	deleteAsset: (id: string) => assetManifestSlice.actions.deleteAsset(id),
	addApiKeyAsset: (name: string, value: string, id?: string) => {
		const assetId = id || uuid();
		return assetManifestSlice.actions.addApiKeyAsset({ id: assetId, name, value });
	},
};

// Export types
export type { Asset };

// Export the reducer as default
export default assetManifestSlice.reducer;
