import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { omit } from 'es-toolkit/compat';
import { v4 as uuid } from 'uuid';

import type { ExtractedAsset } from '@codaco/protocol-validation';
import {
  getProtocolOpenElsewhere,
  setStorageUnavailable,
} from '~/ducks/modules/app';
import type { RootState } from '~/ducks/modules/root';
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

// Researcher-facing text for any import failure that is not one of the coded
// validation errors. Those carry a `code` and a message already written for a
// researcher; every other message is internal ("Cannot save asset: no active
// protocol scope", "Unsupported asset type for file: …") and must not reach a
// dialog verbatim.
export const GENERIC_IMPORT_FAILURE_MESSAGE =
  'Check that it is a supported file type, and try again.';

const getImportAssetErrorInfo = (
  error: unknown,
  filename: string,
): ImportAssetErrorInfo => {
  const codedError: (Error & { code?: unknown }) | null =
    error instanceof Error ? error : null;
  const rawCode = codedError?.code;
  const code = typeof rawCode === 'string' ? rawCode : undefined;
  return {
    filename,
    // A code is only ever set on errors whose message was written for a
    // researcher; everything else is internal and is replaced.
    message:
      codedError && code ? codedError.message : GENERIC_IMPORT_FAILURE_MESSAGE,
    code,
  };
};

// Async thunks. `state` is narrowed to the slice this thunk actually reads, so
// it stays dispatchable from a store built with only those reducers.
export const importAssetAsync = createAsyncThunk<
  ImportAssetCompletePayload,
  File,
  { state: Pick<RootState, 'app'> }
>(
  'assetManifest/importAssetAsync',
  async (file, { dispatch, getState, rejectWithValue }) => {
    const name = file.name;
    const assetId = uuid();

    // The asset blob is written into a store keyed by protocol id, with no
    // exclusivity check of its own, so a tab that no longer owns the protocol
    // could drop a file into the owning tab's scope — a durable write from a
    // tab whose manifest entry naming it can never be saved. Refuse before
    // anything is written, and say why.
    if (getProtocolOpenElsewhere(getState())) {
      return rejectWithValue({
        filename: name,
        code: 'PROTOCOL_OPEN_ELSEWHERE',
        message:
          'This protocol is open in another tab, which holds the saved copy. Close the other tab, then add the file again.',
      } satisfies ImportAssetErrorInfo);
    }

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
