import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { omit } from 'es-toolkit/compat';
import { v4 as uuid } from 'uuid';

import type { ExtractedAsset } from '@codaco/protocol-validation';
import { setStorageUnavailable } from '~/ducks/modules/app';
import { saveAssetWithFallback } from '~/utils/assetUtils';
import { validateAsset } from '~/utils/protocols/assetTools';
import { getSupportedAssetType } from '~/utils/protocols/importAsset';

// Types
type AssetType = 'video' | 'audio' | 'image' | 'network' | 'geojson' | 'apikey';

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
  duplicateCount: number;
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

export type ImportAssetErrorInfo = {
  filename: string;
  message: string;
  code?: string;
};

const getImportAssetErrorInfo = (
  error: unknown,
  filename: string,
): ImportAssetErrorInfo => {
  const normalized =
    error instanceof Error
      ? error
      : new Error('The file could not be imported.');
  const codedError = normalized as Error & { code?: string };
  return {
    filename,
    message: normalized.message,
    code: codedError.code,
  };
};

// Async thunks
export const importAssetAsync = createAsyncThunk(
  'assetManifest/importAssetAsync',
  async (file: File, { dispatch, rejectWithValue }) => {
    const name = file.name;
    const assetId = uuid();

    try {
      // Validate asset
      const validationResult = await validateAsset(file);

      // Convert File to Blob and create ExtractedAsset
      const blob = new Blob([file], { type: file.type });
      const asset: ExtractedAsset = {
        id: assetId,
        name: file.name,
        data: blob,
      };

      // Store in IndexedDB, falling back to the in-memory store when persistent
      // storage is unavailable (e.g. Safari private browsing) so assets can still
      // be added this session. Flag the protocol so the UI warns it won't persist.
      const { persisted } = await saveAssetWithFallback(asset);
      if (persisted) {
        dispatch(setStorageUnavailable(false));
      } else {
        dispatch(setStorageUnavailable(true));
      }

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
        duplicateCount: validationResult.duplicateCount,
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
      return rejectWithValue(getImportAssetErrorInfo(error, name));
    }
  },
);

// Initial state
const initialState: AssetManifestState = {};

// Asset manifest slice
const assetManifestSlice = createSlice({
  name: 'assetManifest',
  initialState,
  reducers: {
    importAssetComplete: (
      state,
      action: PayloadAction<ImportAssetCompletePayload>,
    ) => {
      const { id, filename, name, assetType } = action.payload;
      state[id] = {
        id,
        type: assetType,
        name,
        source: filename,
      };
    },
    importAssetFailed: (
      _state,
      _action: PayloadAction<ImportAssetFailedPayload>,
    ) => {},
    deleteAsset: (state, action: PayloadAction<string>) => {
      const assetId = action.payload;
      // Keep the blob on disk so an undo can restore this manifest entry. The
      // durable save path GCs blobs no longer referenced by the manifest.
      return omit(state, assetId);
    },
    addApiKeyAsset: (state, action: PayloadAction<AddApiKeyAssetPayload>) => {
      const { id, name, value } = action.payload;
      state[id] = {
        id,
        type: 'apikey',
        name,
        value,
      };
    },
  },
});

// Export convenience wrappers with cleaner API
export const deleteAsset = (id: string) =>
  assetManifestSlice.actions.deleteAsset(id);
export const addApiKeyAsset = (name: string, value: string) => {
  const id = uuid();
  return assetManifestSlice.actions.addApiKeyAsset({ id, name, value });
};

// Export for backwards compatibility and testing
export const test = {
  importAssetComplete: (
    filename: string,
    name: string,
    assetType: AssetType,
    id?: string,
  ) => {
    const assetId = id || uuid();
    return assetManifestSlice.actions.importAssetComplete({
      id: assetId,
      filename,
      name,
      assetType,
      duplicateCount: 0,
    });
  },
  deleteAsset: (id: string) => assetManifestSlice.actions.deleteAsset(id),
  addApiKeyAsset: (name: string, value: string, id?: string) => {
    const assetId = id || uuid();
    return assetManifestSlice.actions.addApiKeyAsset({
      id: assetId,
      name,
      value,
    });
  },
};

// Export types
export type { Asset };

// Export the reducer as default
export default assetManifestSlice.reducer;
