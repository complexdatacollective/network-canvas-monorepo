import { type Dispatch } from '@reduxjs/toolkit';
import { navigate } from 'wouter/use-browser-location';
import { z } from 'zod';

import {
  type CurrentProtocol,
  type ExtractedAsset,
  extractProtocolFromZip,
  getMigrationInfo,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import { APP_SCHEMA_VERSION } from '~/config';
import { createAppAsyncThunk } from '~/ducks/createAppAsyncThunk';
import {
  appUpgradeRequiredDialog,
  generalErrorDialog,
  mayUpgradeProtocolDialog,
  validationErrorDialog,
} from '~/ducks/modules/userActions/dialogs';
import {
  saveProtocolAssets,
  saveProtocolAssetsToMemory,
} from '~/utils/assetUtils';
import {
  armInMemoryUnloadGuard,
  disarmInMemoryUnloadGuard,
} from '~/utils/beforeUnloadGuard';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import {
  setExportInProgress,
  setImportInProgress,
} from '~/utils/criticalOperation';
import { ensureError } from '~/utils/ensureError';
import {
  assertCompressedSizeWithinLimit,
  loadGuardedNetcanvas,
  NetcanvasTooLargeError,
} from '~/utils/netcanvasSizeGuard';
import {
  deleteStoredProtocol,
  getStoredProtocol,
  putStoredProtocol,
} from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';
import { isStorageUnavailableError } from '~/utils/storageErrors';

import { clearActiveProtocol, setActiveProtocol } from '../activeProtocol';
import {
  getActiveProtocolId,
  setActiveProtocolId,
  setStorageUnavailable,
} from '../app';

type ImportSource = 'local' | 'bundled';

// A protocol failed schema validation during import. This is an expected
// outcome for an old or malformed file, so we record an analytics event
// (mirroring the editor-time `protocol_validation_failed` event) but do not
// report it as an exception.
const trackImportValidationFailure = (
  source: ImportSource,
  error: z.ZodError,
) => {
  const flattenedErrors = z.flattenError(error);
  posthog.capture('protocol_import_failed', {
    source,
    reason: 'validation',
    error_count: error.issues.length,
    error_message: z.prettifyError(error),
    form_errors: flattenedErrors.formErrors,
    field_errors: flattenedErrors.fieldErrors,
  });
};

// An unexpected error was thrown while importing a protocol (fetch, unzip,
// migration, asset IO, corrupt file). Report it as an exception so it surfaces
// in error tracking, alongside the analytics event.
const trackImportException = (source: ImportSource, error: unknown) => {
  const normalizedError = reportError(error);
  posthog.capture('protocol_import_failed', {
    source,
    reason: 'error',
    error_message: normalizedError.message,
  });
};

// Persist a protocol into the library and load it into the editing buffer.
// Used by every "open" path so each opened protocol becomes a saved, namespaced
// library entry with its own assets. The library row is written before assets
// to minimise orphaned-asset windows, and the active id is set before the
// protocol so the protocol page mounts with the correct asset scope.
const instantiateProtocol = async (
  {
    protocol,
    assets = [],
    name,
    description,
  }: {
    protocol: CurrentProtocol;
    assets?: ExtractedAsset[];
    name: string;
    description?: string;
  },
  dispatch: Dispatch,
): Promise<void> => {
  const protocolId = crypto.randomUUID();

  try {
    await putStoredProtocol({ id: protocolId, protocol, name, description });
    try {
      await saveProtocolAssets(assets, protocolId);
    } catch (error) {
      // Don't leave a library row whose assetManifest points at assets that
      // were never persisted; remove the orphaned row before surfacing.
      await deleteStoredProtocol(protocolId);
      throw error;
    }
  } catch (error) {
    // Persistent storage is unavailable (e.g. Safari private browsing, whose
    // quota is too small for the bundled media). Open the protocol from an
    // in-memory copy so it stays usable this session, and flag it so the UI can
    // warn that it won't be saved on this device. Other errors are real bugs and
    // are rethrown for the caller's import-error handling.
    if (!isStorageUnavailableError(error)) {
      throw error;
    }

    saveProtocolAssetsToMemory(assets, protocolId);
    dispatch(setStorageUnavailable(true));
    dispatch(setActiveProtocolId(protocolId));
    dispatch(setActiveProtocol(protocol));
    // Nothing is persisted in this mode, so warn before the tab closes to avoid
    // silently losing the in-memory protocol.
    armInMemoryUnloadGuard();
    navigate('/protocol');
    return;
  }

  // The protocol persisted successfully, so clear any earlier storage-unavailable
  // flag (it is persisted to localStorage) to re-enable autosave for this and
  // subsequent opens, and drop the in-memory unload warning.
  dispatch(setStorageUnavailable(false));
  disarmInMemoryUnloadGuard();
  dispatch(setActiveProtocolId(protocolId));
  dispatch(setActiveProtocol(protocol));

  navigate('/protocol');
};

export const openLocalNetcanvas = createAppAsyncThunk(
  'protocol/openLocalNetcanvas',
  async (file: File, { dispatch }) => {
    // Signal an import is in flight so a fresh-load service-worker update won't
    // silently reload mid-import (which could leave a partial library row).
    setImportInProgress(true);
    try {
      const fileName = file.name.toLowerCase();

      if (!fileName.endsWith('.netcanvas')) {
        // Expected user mistake, not an error to report: surface the same
        // dialog and return without reaching the exception-reporting catch.
        dispatch(
          generalErrorDialog(
            'Failed to Open Protocol',
            'Unsupported file type. Please open a .netcanvas file.',
          ),
        );
        return false;
      }

      // Reject oversized files and deflate bombs before inflating any asset, so
      // a shared .netcanvas can't OOM-crash the tab. This is an expected input
      // problem (like an unsupported file type), so surface it without reaching
      // the exception-reporting catch below.
      let guardedZip: Awaited<ReturnType<typeof loadGuardedNetcanvas>>;
      try {
        // Reject by declared file size before buffering the whole file into
        // memory, so an oversized file can't OOM the tab during arrayBuffer().
        assertCompressedSizeWithinLimit(file.size);

        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // Re-check the buffered bytes (defence in depth) and reject deflate bombs.
        guardedZip = await loadGuardedNetcanvas(bytes);
      } catch (error) {
        if (error instanceof NetcanvasTooLargeError) {
          dispatch(
            generalErrorDialog('Failed to Open Protocol', error.message),
          );
          return false;
        }
        throw error;
      }

      // Reuse the zip the guard already parsed rather than re-loading the archive.
      const { protocol, assets } = await extractProtocolFromZip(guardedZip);
      const protocolName = file.name.replace(/\.netcanvas$/, '');

      // Handle migration if needed
      const migratedProtocol = await dispatch(
        handleProtocolMigration({
          protocol: protocol as CurrentProtocol,
          name: protocolName,
        }),
      ).unwrap();

      if (!migratedProtocol) {
        // Migration was canceled or app upgrade is required; the migration
        // step has already surfaced the appropriate dialog. Treat as a benign
        // exit rather than a reportable exception.
        dispatch(
          generalErrorDialog(
            'Failed to Open Protocol',
            'Protocol migration failed or was canceled.',
          ),
        );
        return false;
      }

      // Validate the protocol
      const validationResult = await validateProtocol(
        migratedProtocol as CurrentProtocol,
      );

      if (!validationResult.success) {
        trackImportValidationFailure('local', validationResult.error);
        const errorMessage = ensureError(validationResult.error).message;
        dispatch(validationErrorDialog(errorMessage));
        return false;
      }

      const finalProtocol = migratedProtocol as CurrentProtocol;
      await instantiateProtocol(
        {
          protocol: finalProtocol,
          assets,
          name: finalProtocol.name ?? protocolName,
          description: finalProtocol.description,
        },
        dispatch,
      );
    } catch (error) {
      trackImportException('local', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      dispatch(generalErrorDialog('Failed to Open Protocol', errorMessage));
      return false;
    } finally {
      setImportInProgress(false);
    }
  },
);

const schemaVersionStates = {
  OK: 'OK',
  UPGRADE_PROTOCOL: 'UPGRADE_PROTOCOL',
  UPGRADE_APP: 'UPGRADE_APP',
} as const;

type schemaVersionStates =
  (typeof schemaVersionStates)[keyof typeof schemaVersionStates];

const checkSchemaVersion = (protocol: CurrentProtocol): schemaVersionStates => {
  const protocolSchemaVersion = protocol.schemaVersion;
  if (protocolSchemaVersion === APP_SCHEMA_VERSION) {
    return schemaVersionStates.OK;
  }
  if (protocolSchemaVersion < APP_SCHEMA_VERSION) {
    return schemaVersionStates.UPGRADE_PROTOCOL;
  }
  return schemaVersionStates.UPGRADE_APP;
};

// helper function so we can use loadingLock
const handleProtocolMigration = createAppAsyncThunk(
  'protocol/openOrUpgrade',
  async (
    { protocol, name }: { protocol: CurrentProtocol; name: string },
    { dispatch },
  ) => {
    const schemaVersionStatus = checkSchemaVersion(protocol);
    switch (schemaVersionStatus) {
      case schemaVersionStates.OK: {
        return protocol;
      }
      case schemaVersionStates.UPGRADE_PROTOCOL: {
        const migrationInfo = getMigrationInfo(
          protocol.schemaVersion,
          APP_SCHEMA_VERSION,
        );
        const upgradeDialog = mayUpgradeProtocolDialog(
          protocol.schemaVersion,
          APP_SCHEMA_VERSION,
          migrationInfo.notes,
        );

        const confirm = await dispatch(upgradeDialog).unwrap();
        if (!confirm) {
          return false;
        }

        const migratedProtocol = migrateProtocol(protocol, APP_SCHEMA_VERSION, {
          name,
        });
        return migratedProtocol as CurrentProtocol;
      }
      case schemaVersionStates.UPGRADE_APP:
        await dispatch(appUpgradeRequiredDialog(protocol.schemaVersion));
        return false;
      default:
        return false;
    }
  },
);

type CreateNetcanvasParams = {
  name: string;
  description?: string;
};

// Create a new protocol
export const createNetcanvas = createAppAsyncThunk(
  'webUserActions/createNetcanvas',
  async ({ name, description }: CreateNetcanvasParams, { dispatch }) => {
    // Create a new empty protocol
    const newProtocol: CurrentProtocol = {
      name,
      description,
      schemaVersion: APP_SCHEMA_VERSION,
      stages: [],
      codebook: {
        node: {},
        edge: {},
        ego: {},
      },
      assetManifest: {},
    } as CurrentProtocol;

    await instantiateProtocol(
      { protocol: newProtocol, name, description },
      dispatch,
    );
  },
);

// Open one of the app's bundled research templates. The protocol object is
// already at the current schema version, so we skip the fetch/extract and
// migration steps and validate it directly. Like the remote-template flow, a
// fresh library entry (new id) is created so a template can be opened
// repeatedly without overwriting earlier copies.
export const openBundledTemplate = createAppAsyncThunk(
  'webUserActions/openBundledTemplate',
  async (
    {
      protocol,
      name,
      assets,
    }: { protocol: CurrentProtocol; name?: string; assets?: ExtractedAsset[] },
    { dispatch },
  ) => {
    try {
      const validationResult = await validateProtocol(protocol);

      if (!validationResult.success) {
        trackImportValidationFailure('bundled', validationResult.error);
        const errorMessage = ensureError(validationResult.error).message;
        dispatch(validationErrorDialog(errorMessage));
        return false;
      }

      const finalName = name ?? protocol.name;
      await instantiateProtocol(
        {
          protocol: name ? { ...protocol, name } : protocol,
          assets,
          name: finalName,
          description: protocol.description,
        },
        dispatch,
      );
      return true;
    } catch (error) {
      trackImportException('bundled', error);
      const errorMessage = ensureError(error).message;
      dispatch(generalErrorDialog('Protocol Import Error', errorMessage));
      return false;
    }
  },
);

// Export protocol as .netcanvas file
export const exportNetcanvas = createAppAsyncThunk(
  'webUserActions/exportNetcanvas',
  async (_, { dispatch, getState }) => {
    const state = getState();
    const protocol = state.activeProtocol?.present;

    if (!protocol) {
      throw new Error('No active protocol to export');
    }

    // Signal an export is in flight so a service-worker update reload warns/defers
    // rather than interrupting the download.
    setExportInProgress(true);
    try {
      const skippedAssets = await downloadProtocolAsNetcanvas(
        protocol as CurrentProtocol,
        protocol.name,
        getActiveProtocolId(state) ?? undefined,
      );

      // Export is best-effort: unresolvable assets are omitted rather than
      // aborting the whole export, but the author must be told which ones so a
      // silently incomplete file isn't shared.
      if (skippedAssets.length > 0) {
        const assetList = skippedAssets.map((asset) => asset.name).join(', ');
        dispatch(
          generalErrorDialog(
            'Some assets could not be exported',
            `Your protocol was downloaded, but these assets could not be ` +
              `included and are missing from the file: ${assetList}.`,
          ),
        );
      }

      return true;
    } finally {
      setExportInProgress(false);
    }
  },
);

// Load a protocol already saved in the library into the editing buffer. Its
// assets are already namespaced under this id in IndexedDB.
export const openLibraryProtocol = createAppAsyncThunk(
  'webUserActions/openLibraryProtocol',
  async (id: string, { dispatch }) => {
    const row = await getStoredProtocol(id);
    if (!row) {
      dispatch(
        generalErrorDialog(
          'Protocol Not Found',
          'This protocol could not be found in your library.',
        ),
      );
      return;
    }

    // This protocol is loaded from durable storage, so any earlier in-memory
    // unload warning no longer applies.
    disarmInMemoryUnloadGuard();
    dispatch(setActiveProtocolId(id));
    dispatch(setActiveProtocol(row.protocol));
    navigate('/protocol');
  },
);

// Remove a protocol (and its assets) from the library. If it is the one
// currently being edited, also close the editing buffer.
export const deleteLibraryProtocol = createAppAsyncThunk(
  'webUserActions/deleteLibraryProtocol',
  async (id: string, { dispatch, getState }) => {
    await deleteStoredProtocol(id);

    const state = getState();
    if (getActiveProtocolId(state) === id) {
      disarmInMemoryUnloadGuard();
      dispatch(setActiveProtocolId(null));
      dispatch(clearActiveProtocol());
    }
  },
);
