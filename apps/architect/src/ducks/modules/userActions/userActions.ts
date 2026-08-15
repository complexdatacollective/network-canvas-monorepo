import { type Dispatch } from '@reduxjs/toolkit';
import { navigate } from 'wouter/use-browser-location';

import {
  type ConfigurationProblem,
  type CurrentProtocol,
  type ExtractedAsset,
  extractProtocolFromZip,
  getMigrationInfo,
  type MigrationNote,
  migrateProtocol,
  NetcanvasInflationLimitError,
  type ProtocolValidationError,
  validateProtocol,
} from '@codaco/protocol-validation';
import { posthog } from '~/analytics';
import { APP_SCHEMA_VERSION } from '~/config';
import { createAppAsyncThunk } from '~/ducks/createAppAsyncThunk';
import { timelineActions } from '~/ducks/middleware/timeline';
import type { ProtocolSourceRef } from '~/templates';
import {
  saveProtocolAssets,
  saveProtocolAssetsToMemory,
} from '~/utils/assetUtils';
import {
  armInMemoryUnloadGuard,
  disarmInMemoryUnloadGuard,
} from '~/utils/beforeUnloadGuard';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { assessConfigurationRepair } from '~/utils/configurationRepair';
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
  describeImportFailure,
  PROTOCOL_OPEN_FAILURE_MESSAGE,
  TEMPLATE_OPEN_FAILURE_MESSAGE,
} from '~/utils/protocolImportErrors';
import {
  deleteStoredProtocol,
  getStoredProtocol,
  putStoredProtocol,
} from '~/utils/protocolLibrary';
import { reportError } from '~/utils/reportError';
import { isStorageUnavailableError } from '~/utils/storageErrors';
import { admitStoredProtocol } from '~/utils/storedProtocolAdmission';

import { clearActiveProtocol, setActiveProtocol } from '../activeProtocol';
import {
  getActiveProtocolId,
  setActiveProtocolId,
  setStorageUnavailable,
} from '../app';

type ImportSource = 'local' | 'bundled';

export type ProtocolOpenResult =
  | { status: 'opened' }
  | {
      status: 'error';
      title: string;
      message: string;
      /**
       * The underlying error's own text, for the dialog's collapsed technical
       * details. Absent when the failure is an expected input problem whose
       * message already says everything there is to know (an unsupported file
       * type, an over-large file) — there is nothing further to disclose.
       */
      detail?: string;
    }
  | {
      status: 'validation-error';
      message: string;
    }
  | {
      /**
       * The protocol does not open because of configuration Architect
       * recognises and, when `repairable`, can fix. Never repaired silently:
       * the researcher is shown what is wrong and chooses.
       */
      status: 'repair-required';
      problems: ConfigurationProblem[];
      repairable: boolean;
    }
  | {
      status: 'migration-required';
      protocolSchemaVersion: number;
      targetSchemaVersion: number;
      migrationNotes: MigrationNote[];
    }
  | {
      status: 'app-upgrade-required';
      protocolSchemaVersion: number;
    };

const openedResult: ProtocolOpenResult = { status: 'opened' };

// A protocol failed schema validation during import. This is an expected
// outcome for an old or malformed file, so we record an analytics event
// (mirroring the editor-time `protocol_validation_failed` event) but do not
// report it as an exception.
const trackImportValidationFailure = (
  source: ImportSource,
  error: ProtocolValidationError,
) => {
  // Report only the structural shape of each failure — the issue code and its
  // schema path — never the prettified message or flattened error maps, which
  // embed protocol-derived names and values (codebook record keys, variable
  // names, entered values). Mirrors the editor-time `protocol_validation_failed`
  // event in analyticsListener.
  posthog.capture('protocol_import_failed', {
    source,
    reason: 'validation',
    error_count: error.issues.length,
    error_codes: error.issues.map((issue) => issue.code),
    error_paths: error.issues.map((issue) => issue.path.join('.')),
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
    sourceRef,
  }: {
    protocol: CurrentProtocol;
    assets?: ExtractedAsset[];
    name: string;
    description?: string;
    sourceRef?: ProtocolSourceRef;
  },
  dispatch: Dispatch,
): Promise<void> => {
  const protocolId = crypto.randomUUID();

  try {
    await putStoredProtocol({
      id: protocolId,
      protocol,
      name,
      description,
      sourceRef,
    });
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
  // flag (it is persisted to localStorage) to re-enable canonical persistence
  // for this and subsequent opens, and drop the in-memory unload warning.
  dispatch(setStorageUnavailable(false));
  disarmInMemoryUnloadGuard();
  dispatch(setActiveProtocolId(protocolId));
  dispatch(setActiveProtocol(protocol));

  navigate('/protocol');
};

type OpenLocalNetcanvasParams = {
  file: File;
  migrationApproved?: boolean;
  repairApproved?: boolean;
};

export const openLocalNetcanvas = createAppAsyncThunk(
  'protocol/openLocalNetcanvas',
  async (
    {
      file,
      migrationApproved = false,
      repairApproved = false,
    }: OpenLocalNetcanvasParams,
    { dispatch: storeDispatch },
  ): Promise<ProtocolOpenResult> => {
    // Signal an import is in flight so a fresh-load service-worker update won't
    // silently reload mid-import (which could leave a partial library row).
    setImportInProgress(true);
    try {
      const fileName = file.name.toLowerCase();

      if (!fileName.endsWith('.netcanvas')) {
        // Expected user mistake, not an error to report: surface the same
        // dialog and return without reaching the exception-reporting catch.
        return {
          status: 'error',
          title: 'Failed to Open Protocol',
          message: 'Unsupported file type. Please open a .netcanvas file.',
        };
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
          return {
            status: 'error',
            title: 'Failed to Open Protocol',
            message: error.message,
          };
        }
        throw error;
      }

      // Reuse the zip the guard already parsed rather than re-loading the
      // archive. extractProtocolFromZip caps the *actual* inflated output as it
      // streams, so a deflate bomb that under-declares its size in the central
      // directory (and so slips past loadGuardedNetcanvas) still aborts here
      // instead of OOM-crashing the tab.
      let protocol: Awaited<
        ReturnType<typeof extractProtocolFromZip>
      >['protocol'];
      let assets: Awaited<ReturnType<typeof extractProtocolFromZip>>['assets'];
      try {
        ({ protocol, assets } = await extractProtocolFromZip(guardedZip));
      } catch (error) {
        if (error instanceof NetcanvasInflationLimitError) {
          return {
            status: 'error',
            title: 'Failed to Open Protocol',
            message: error.message,
          };
        }
        throw error;
      }
      const protocolName = file.name.replace(/\.netcanvas$/, '');

      // Handle migration if needed
      const migrationResult = handleProtocolMigration({
        protocol: protocol as CurrentProtocol,
        name: protocolName,
        approved: migrationApproved,
      });

      if (migrationResult.status !== 'ready') {
        return migrationResult.result;
      }

      const migratedProtocol = migrationResult.protocol;

      // Validate the protocol
      const validationResult = await validateProtocol(
        migratedProtocol as CurrentProtocol,
      );

      let admittedProtocol = migratedProtocol as CurrentProtocol;
      if (!validationResult.success) {
        // A protocol authored before the interface-ownership rules can fail
        // here for reasons Architect knows how to fix. Offer the fix rather
        // than the raw validation error — but only once the researcher has
        // seen exactly what would change and agreed to it.
        const assessment = await assessConfigurationRepair(admittedProtocol);
        if (assessment.status === 'repairable' && repairApproved) {
          admittedProtocol = assessment.protocol;
        } else if (assessment.status !== 'clean') {
          return {
            status: 'repair-required',
            problems: assessment.problems,
            repairable: assessment.status === 'repairable',
          };
        } else {
          trackImportValidationFailure('local', validationResult.error);
          const errorMessage = ensureError(validationResult.error).message;
          return { status: 'validation-error', message: errorMessage };
        }
      }

      const finalProtocol = admittedProtocol;
      await instantiateProtocol(
        {
          protocol: finalProtocol,
          assets,
          name: finalProtocol.name ?? protocolName,
          description: finalProtocol.description,
        },
        storeDispatch,
      );
      return openedResult;
    } catch (error) {
      trackImportException('local', error);
      // The raw error still reaches exception reporting and the console above;
      // what the dialog leads with is Architect's own description of it, and
      // the raw text is offered only behind the technical-details disclosure.
      const { message, detail } = describeImportFailure(
        error,
        PROTOCOL_OPEN_FAILURE_MESSAGE,
      );
      return {
        status: 'error',
        title: 'Failed to Open Protocol',
        message,
        detail,
      };
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

type ProtocolMigrationResult =
  | { status: 'ready'; protocol: CurrentProtocol }
  | {
      status: 'needs-ui';
      result: Extract<
        ProtocolOpenResult,
        { status: 'migration-required' | 'app-upgrade-required' | 'error' }
      >;
    };

const handleProtocolMigration = ({
  protocol,
  name,
  approved,
}: {
  protocol: CurrentProtocol;
  name: string;
  approved: boolean;
}): ProtocolMigrationResult => {
  const schemaVersionStatus = checkSchemaVersion(protocol);
  switch (schemaVersionStatus) {
    case schemaVersionStates.OK: {
      return { status: 'ready', protocol };
    }
    case schemaVersionStates.UPGRADE_PROTOCOL: {
      if (!approved) {
        const migrationInfo = getMigrationInfo(
          protocol.schemaVersion,
          APP_SCHEMA_VERSION,
        );
        return {
          status: 'needs-ui',
          result: {
            status: 'migration-required',
            protocolSchemaVersion: protocol.schemaVersion,
            targetSchemaVersion: APP_SCHEMA_VERSION,
            migrationNotes: migrationInfo.notes,
          },
        };
      }

      const migratedProtocol = migrateProtocol(protocol, APP_SCHEMA_VERSION, {
        name,
      });
      return { status: 'ready', protocol: migratedProtocol as CurrentProtocol };
    }
    case schemaVersionStates.UPGRADE_APP:
      return {
        status: 'needs-ui',
        result: {
          status: 'app-upgrade-required',
          protocolSchemaVersion: protocol.schemaVersion,
        },
      };
    default:
      return {
        status: 'needs-ui',
        result: {
          status: 'error',
          title: 'Failed to Open Protocol',
          message: 'Protocol migration failed.',
        },
      };
  }
};

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
      sourceRef,
    }: {
      protocol: CurrentProtocol;
      name?: string;
      assets?: ExtractedAsset[];
      sourceRef?: ProtocolSourceRef;
    },
    { dispatch },
  ): Promise<ProtocolOpenResult> => {
    // Signal an import is in flight so a fresh-load service-worker update won't
    // silently reload mid-import (which could leave a library row whose bundled
    // assets were never written). Mirrors openLocalNetcanvas.
    setImportInProgress(true);
    try {
      const finalProtocol = name ? { ...protocol, name } : protocol;
      const validationResult = await validateProtocol(finalProtocol);

      if (!validationResult.success) {
        trackImportValidationFailure('bundled', validationResult.error);
        const errorMessage = ensureError(validationResult.error).message;
        return { status: 'validation-error', message: errorMessage };
      }

      const finalName = name ?? protocol.name;
      await instantiateProtocol(
        {
          protocol: finalProtocol,
          assets,
          name: finalName,
          description: protocol.description,
          sourceRef,
        },
        dispatch,
      );
      return openedResult;
    } catch (error) {
      trackImportException('bundled', error);
      // A bundled template never opens an archive, so the file-shaped reasons
      // are unreachable here — but storage failures are not, and the default
      // must talk about the template, never about a damaged file.
      const { message, detail } = describeImportFailure(
        error,
        TEMPLATE_OPEN_FAILURE_MESSAGE,
      );
      return {
        status: 'error',
        title: 'Protocol Import Error',
        message,
        detail,
      };
    } finally {
      setImportInProgress(false);
    }
  },
);

// Export protocol as .netcanvas file.
//
// `protocolOverride` exists for the one case where the file must NOT be the
// canonical protocol: rescuing an uncommitted stage draft, whose stage and
// codebook edits live outside `activeProtocol` and would otherwise be missing
// from the very download offered to preserve them. It changes nothing on disk
// or in the library — assets still resolve against the active protocol id.
export const exportNetcanvas = createAppAsyncThunk(
  'webUserActions/exportNetcanvas',
  async (protocolOverride: CurrentProtocol | undefined, { getState }) => {
    const state = getState();
    const protocol = protocolOverride ?? state.activeProtocol?.present;

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

      return { skippedAssets };
    } finally {
      setExportInProgress(false);
    }
  },
);

type OpenLibraryProtocolParams = {
  id: string;
  repairApproved?: boolean;
};

// Load a protocol already saved in the library into the editing buffer. Its
// assets are already namespaced under this id in IndexedDB.
export const openLibraryProtocol = createAppAsyncThunk(
  'webUserActions/openLibraryProtocol',
  async (
    { id, repairApproved = false }: OpenLibraryProtocolParams,
    { dispatch },
  ): Promise<ProtocolOpenResult> => {
    const row = await getStoredProtocol(id);
    if (!row) {
      return {
        status: 'error',
        title: 'Protocol Not Found',
        message: 'This protocol could not be found in your library.',
      };
    }

    let protocol = row.protocol;
    try {
      const admission = await admitStoredProtocol(row);
      if (!admission.success) {
        // A stored protocol authored before the interface-ownership rules can
        // fail admission for reasons Architect knows how to fix. The repair is
        // written back to the library so the researcher is not asked again.
        const assessment = await assessConfigurationRepair(protocol);
        if (assessment.status === 'repairable' && repairApproved) {
          protocol = assessment.protocol;
          await putStoredProtocol({
            id,
            protocol,
            name: row.name,
            description: row.description,
          });
        } else if (assessment.status !== 'clean') {
          return {
            status: 'repair-required',
            problems: assessment.problems,
            repairable: assessment.status === 'repairable',
          };
        } else {
          return {
            status: 'validation-error',
            message: ensureError(admission.error).message,
          };
        }
      }
    } catch (error: unknown) {
      reportError(error, { operation: 'stored-protocol-admission' });
      const { message, detail } = describeImportFailure(
        error,
        PROTOCOL_OPEN_FAILURE_MESSAGE,
      );
      return {
        status: 'error',
        title: 'Protocol Open Error',
        message,
        detail,
      };
    }

    // This protocol is loaded from durable storage, so any earlier in-memory
    // unload warning/storage failure no longer applies.
    dispatch(setStorageUnavailable(false));
    disarmInMemoryUnloadGuard();
    dispatch(setActiveProtocolId(id));
    dispatch(setActiveProtocol(protocol));
    navigate('/protocol');
    return openedResult;
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
      // `clearActiveProtocol` matches `protocolPattern` in ducks/modules/root.ts,
      // so without this the timeline middleware takes its default path and
      // pushes a `structuredClone` of the protocol that was just deleted onto
      // `past` — where it stays, holding whatever the researcher wrote in
      // labels, prompts and the codebook, until another protocol is opened or
      // the page reloads. The dialog says it is permanently removed from this
      // device, so it has to be. Same rule, same pairing as
      // `restoreActiveProtocol`'s `clearRestoredSession` and
      // `protocolValidationListener`.
      dispatch(timelineActions.reset(null));
    }
  },
);
