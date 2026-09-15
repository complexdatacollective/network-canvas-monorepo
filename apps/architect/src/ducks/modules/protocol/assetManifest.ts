import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import { omit } from 'es-toolkit/compat';
import { v4 as uuid } from 'uuid';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { ExtractedAsset } from '@codaco/protocol-validation';
import { hasOpenNestedEditor } from '~/components/DialogForm/nestedDraftRegistry';
import {
  getProtocolLockState,
  setStorageUnavailable,
} from '~/ducks/modules/app';
import type { RootState } from '~/ducks/modules/root';
import { getArchitectIntl } from '~/i18n/imperative';
import { deleteStoredAsset, saveAssetWithFallback } from '~/utils/assetUtils';
import type { LocalizedText } from '~/utils/protocolImportErrors';
import {
  refusedCommitDescriptor,
  assetImportSurface,
  refusedCommitMessage,
  type RefusalMessage,
} from '~/utils/protocolLockMessages';
import { validateAsset } from '~/utils/protocols/assetTools';
import { getSupportedAssetType } from '~/utils/protocols/importAsset';

// Types
export type AssetType =
  | 'video'
  | 'audio'
  | 'image'
  | 'network'
  | 'geojson'
  | 'apikey';

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

type AddApiKeyAssetPayload = {
  id: string;
  name: string;
  value: string;
};

export type ImportAssetErrorInfo =
  | {
      filename: string;
      localizedMessage?: LocalizedText;
      detail?: string;
      message: string;
      code?: string;
    }
  | {
      filename: string;
      localizedMessage?: LocalizedText;
      detail?: string;
      /**
       * This tab no longer holds the saved copy. The sentence has to come from
       * `protocolLockMessages` — `RefusalMessage` is producible nowhere else,
       * so this is a build error rather than a fourth set of hand-written
       * sentences that says the same thing differently, which is exactly what
       * this surface used to carry.
       */
      message: RefusalMessage;
      code: 'PROTOCOL_NOT_OWNED_HERE';
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
  const message =
    code === 'NETWORK_EMPTY'
      ? errorMessages.empty
      : code === 'VARIABLE_NAME'
        ? errorMessages.names
        : code === 'COLUMN_MISMATCHED'
          ? errorMessages.columns
          : code === 'UNSUPPORTED_TYPE'
            ? errorMessages.unsupported
            : code === 'REPLACEMENT_TYPE_MISMATCH'
              ? errorMessages.replacementType
              : errorMessages.generic;
  return {
    filename,
    code,
    message: getArchitectIntl().formatMessage(message),
    localizedMessage: { message },
    detail: codedError?.message,
  };
};

// Async thunks. `state` is narrowed to the slice this thunk actually reads, so
// it stays dispatchable from a store built with only those reducers.
/**
 * A file to bring into the protocol, and what to call it.
 *
 * `name` is what the researcher sees; the file's own name is what the manifest
 * records as the entry's `source`, which is the name an export writes the file
 * under. They are the same thing for a drag-and-drop import, and are not for
 * the resource lifecycle, which commits bytes under their content hash so that
 * two imports of different files called `portrait.png` stay two assets.
 */
export type AssetImport = {
  file: File;
  name?: string;
  /**
   * Write this file as the resource that already has this id, instead of
   * adding a new one.
   *
   * Used to supply a file that an imported `.netcanvas` declared but did not
   * contain. Every stage that refers to the resource refers to it by this id,
   * so minting a new one would leave all of them pointing at the entry that is
   * still empty — the researcher would appear to have fixed it and nothing
   * would change.
   */
  replaceAssetId?: string;
  /**
   * The type the replaced entry must keep.
   *
   * The schema types asset references — a canvas background must name an
   * `image`, a roster must name a `network` — so accepting a file of another
   * type would swap a working reference for one that fails validation, on a
   * protocol the researcher is in the middle of repairing.
   */
  expectedType?: AssetType;
};

export const importAssetAsync = createAsyncThunk<
  ImportAssetCompletePayload,
  AssetImport,
  { state: Pick<RootState, 'app'> }
>(
  'assetManifest/importAssetAsync',
  async (
    { file, name: displayName, replaceAssetId, expectedType },
    { dispatch, getState, rejectWithValue },
  ) => {
    const name = displayName ?? file.name;
    const assetId = replaceAssetId ?? uuid();

    // The asset blob is written into a store keyed by protocol id, with no
    // exclusivity check of its own, so a tab that no longer owns the protocol
    // could drop a file into the owning tab's scope — a durable write from a
    // tab whose manifest entry naming it can never be saved. Refuse before
    // anything is written, and say why — in the words the other three refusing
    // surfaces use, from the one table that holds them.
    //
    // A blocked reclaim has two shapes since #1387: an unresolved stage-draft
    // choice, and an editor still open with unsaved changes in it. The blocker
    // is what decides which dialog is on screen, so it is what the refusal is
    // keyed on; asking whether a stage editor happens to be open instead named
    // the wrong one, and sent the researcher looking for a question nobody was
    // asking.
    //
    // Both questions are asked at the moment of the call rather than sampled
    // once, because an import spans two awaits and this tab can be demoted
    // across either of them — `useProtocolTabLock`'s
    // `onExclusivityChange(false)` dispatches `setProtocolLockState`, so a
    // throttled peer answering `held` while a large file validates is enough.
    // A decision taken on entry is stale by the time anything is written.
    const refuseIfNotOwned = () => {
      const refusal = refusedCommitMessage(
        getProtocolLockState(getState()),
        assetImportSurface(hasOpenNestedEditor()),
        getArchitectIntl(),
      );
      return refusal
        ? ({
            filename: file.name,
            code: 'PROTOCOL_NOT_OWNED_HERE',
            message: refusal,
            localizedMessage: {
              message: refusedCommitDescriptor(
                getProtocolLockState(getState()),
                assetImportSurface(hasOpenNestedEditor()),
              )!,
            },
          } satisfies ImportAssetErrorInfo)
        : null;
    };

    const refusedOnEntry = refuseIfNotOwned();
    if (refusedOnEntry) {
      return rejectWithValue(refusedOnEntry);
    }

    try {
      // Validate asset
      const validationResult = await validateAsset(file);

      // Ask again now the await has resolved, while the durable write is still
      // the only thing left to await: this is the last point at which refusing
      // leaves nothing behind at all. Returned, never thrown — the `catch`
      // below rewrites a thrown error through `getImportAssetErrorInfo`, which
      // drops the branded `RefusalMessage` for the generic failure sentence.
      const refusedBeforeWrite = refuseIfNotOwned();
      if (refusedBeforeWrite) {
        return rejectWithValue(refusedBeforeWrite);
      }

      // Decided before anything is written. The type comes from the file's
      // name, so it costs nothing to ask early — and asking late meant a
      // replacement of the wrong type had already overwritten the bytes stored
      // under the existing asset id. The manifest entry kept its old `source`
      // and type, `getUnresolvedAssetIds` counted the resource as resolved
      // because a row existed, and the GC retained it because the id was still
      // referenced: a protocol that previews and exports the wrong file.
      const assetType = getSupportedAssetType(file.name) as AssetType | false;

      if (!assetType) {
        throw new Error(`Unsupported asset type for file: ${file.name}`);
      }

      if (expectedType && assetType !== expectedType) {
        throw Object.assign(
          new Error(
            `Replacement for asset ${assetId} is a ${assetType}, expected ${expectedType}`,
          ),
          { code: 'REPLACEMENT_TYPE_MISMATCH' },
        );
      }

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

      const importPayload: ImportAssetCompletePayload = {
        id: assetId,
        filename: file.name, // Used as source in manifest
        name,
        assetType,
        duplicateCount: validationResult.duplicateCount,
      };

      // The blob is already written by this point, so refusing here still
      // leaves it behind — but an unreferenced blob is collected by the durable
      // save path, whereas a manifest entry added in a tab whose writes are
      // dropped is a resource the researcher can see and never save.
      //
      // A repair is the exception: its blob lands under an id the manifest
      // already carries, so it is referenced, never collected, and leaves the
      // resource reading as resolved while the entry still names the old file.
      // Remove it rather than leave that behind. If the tab that took the
      // protocol has since repaired the same resource this discards its bytes
      // too — but that resource then reads as missing, which is visible and
      // repairable, where the state this avoids is silent and exports the
      // wrong file under the old extension.
      const refusedBeforeCommit = refuseIfNotOwned();
      if (refusedBeforeCommit) {
        if (replaceAssetId) {
          await deleteStoredAsset(replaceAssetId);
        }
        return rejectWithValue(refusedBeforeCommit);
      }

      const completed =
        assetManifestSlice.actions.importAssetComplete(importPayload);

      // A repair is not an undoable edit. The blob it writes lands under an id
      // the manifest already carries, so it stays referenced and the durable
      // save path never collects it — an undo would restore an entry naming
      // the old file on top of bytes that are the new one. That is not
      // cosmetic for a network resource: `.csv` and `.json` are both
      // `network`, so the type check above admits the swap and the reader
      // picks its parser from the extension the manifest was rolled back to.
      //
      // There is also nothing to roll back to. Replace is offered only for a
      // resource whose file is missing, so the state before the repair is the
      // broken one.
      dispatch(
        replaceAssetId
          ? { ...completed, meta: { skipTimeline: true } }
          : completed,
      );
      return importPayload;
    } catch (error) {
      // Deliberately dispatches nothing. A refused import changed no resource,
      // so it must not reach the protocol timeline: the thunk's own
      // `pending`/`rejected` lifecycle actions are excluded from it
      // (`ducks/modules/root.ts`), and the rejection value below is what the
      // caller shows the researcher.
      return rejectWithValue(getImportAssetErrorInfo(error, file.name));
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
    deleteAsset: (state, action: PayloadAction<string>) => {
      const assetId = action.payload;
      // `omit` builds a new object even when the key was never there, and a new
      // object is a change as far as the timeline is concerned — an id that is
      // not in the manifest would record an undoable point that undoes nothing.
      // `hasOwn`, not `in`: an id matching an inherited key (`toString`) would
      // otherwise pass the guard and fall through to the rebuild below.
      if (!Object.hasOwn(state, assetId)) {
        return state;
      }
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

const errorMessages = defineMessages({
  empty: {
    id: 'architect.resourceImport.empty',
    defaultMessage: "This network file doesn't contain any nodes or edges.",
    description: 'Researcher-facing Architect control or feedback.',
  },
  names: {
    id: 'architect.resourceImport.names',
    defaultMessage:
      'Some attribute names in this file are invalid. Use only letters, numbers, and the symbols ._-: in column headers, then import the file again.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  columns: {
    id: 'architect.resourceImport.columns',
    defaultMessage:
      'Some rows have a different number of columns. Make each row match the column headers, then import the file again.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  unsupported: {
    id: 'architect.resourceImport.unsupported',
    defaultMessage: 'That file type is not supported as a resource.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  generic: {
    id: 'architect.resourceImport.generic',
    defaultMessage: 'Check that it is a supported file type, and try again.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  replacementType: {
    id: 'architect.resourceImport.replacementType',
    defaultMessage:
      'This file is a different kind of resource from the one it would replace. Choose a file of the same kind, and try again.',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
