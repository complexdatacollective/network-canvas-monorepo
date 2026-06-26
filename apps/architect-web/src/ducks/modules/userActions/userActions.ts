import { createAsyncThunk, type Dispatch } from '@reduxjs/toolkit';
import { navigate } from 'wouter/use-browser-location';
import { z } from 'zod';

import {
  type CurrentProtocol,
  type ExtractedAsset,
  extractProtocol,
  getMigrationInfo,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import { APP_SCHEMA_VERSION } from '~/config';
import {
  appUpgradeRequiredDialog,
  generalErrorDialog,
  mayUpgradeProtocolDialog,
  validationErrorDialog,
} from '~/ducks/modules/userActions/dialogs';
import type { RootState } from '~/ducks/store';
import {
  saveProtocolAssets,
  saveProtocolAssetsToMemory,
} from '~/utils/assetUtils';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { ensureError } from '~/utils/ensureError';
import {
  deleteStoredProtocol,
  getStoredProtocol,
  putStoredProtocol,
} from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';

import { clearActiveProtocol, setActiveProtocol } from '../activeProtocol';
import {
  getActiveProtocolId,
  setActiveProtocolId,
  setStorageUnavailable,
} from '../app';

type ImportSource = 'local' | 'bundled';

// Error names thrown when IndexedDB is unavailable or over quota — the common
// case being Safari private browsing, whose per-origin quota is too small for
// the bundled sample media. Used to decide when to fall back to an in-memory
// copy rather than failing the open outright.
const STORAGE_ERROR_NAMES = new Set([
  'QuotaExceededError',
  'InvalidStateError',
  'UnknownError',
  'SecurityError',
  'AbortError',
  'DatabaseClosedError',
  'OpenFailedError',
  'VersionError',
]);

const isStorageUnavailableError = (error: unknown): boolean => {
  if (error instanceof Error && STORAGE_ERROR_NAMES.has(error.name)) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /quota|indexeddb|idbdatabase|object ?store|storage/i.test(message);
};

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
    navigate('/protocol');
    return;
  }

  // The protocol persisted successfully, so clear any earlier storage-unavailable
  // flag (it is persisted to localStorage) to re-enable autosave for this and
  // subsequent opens.
  dispatch(setStorageUnavailable(false));
  dispatch(setActiveProtocolId(protocolId));
  dispatch(setActiveProtocol(protocol));

  navigate('/protocol');
};

export const openLocalNetcanvas = createAsyncThunk(
  'protocol/openLocalNetcanvas',
  async (file: File, { dispatch }) => {
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

      const arrayBuffer = await file.arrayBuffer();
      const { protocol, assets } = await extractProtocol(
        new Uint8Array(arrayBuffer),
      );
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
const handleProtocolMigration = createAsyncThunk(
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
export const createNetcanvas = createAsyncThunk(
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
export const openBundledTemplate = createAsyncThunk(
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
export const exportNetcanvas = createAsyncThunk(
  'webUserActions/exportNetcanvas',
  async (_, { getState }) => {
    const state = getState() as RootState;
    const protocol = state.activeProtocol?.present;

    if (!protocol) {
      throw new Error('No active protocol to export');
    }
    await downloadProtocolAsNetcanvas(
      protocol as CurrentProtocol,
      protocol.name,
      getActiveProtocolId(state) ?? undefined,
    );

    return true;
  },
);

// Load a protocol already saved in the library into the editing buffer. Its
// assets are already namespaced under this id in IndexedDB.
export const openLibraryProtocol = createAsyncThunk(
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

    dispatch(setActiveProtocolId(id));
    dispatch(setActiveProtocol(row.protocol));
    navigate('/protocol');
  },
);

// Remove a protocol (and its assets) from the library. If it is the one
// currently being edited, also close the editing buffer.
export const deleteLibraryProtocol = createAsyncThunk(
  'webUserActions/deleteLibraryProtocol',
  async (id: string, { dispatch, getState }) => {
    await deleteStoredProtocol(id);

    const state = getState() as RootState;
    if (getActiveProtocolId(state) === id) {
      dispatch(setActiveProtocolId(null));
      dispatch(clearActiveProtocol());
    }
  },
);
