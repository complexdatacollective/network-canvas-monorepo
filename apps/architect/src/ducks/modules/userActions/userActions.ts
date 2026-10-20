import { type Dispatch } from '@reduxjs/toolkit';

import { defineMessages } from '@codaco/app-i18n/messages';
import {
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
import { ensureError } from '@codaco/shared-consts';
import { posthog } from '~/analytics';
import { APP_SCHEMA_VERSION } from '~/config';
import { createAppAsyncThunk } from '~/ducks/createAppAsyncThunk';
import { timelineActions } from '~/ducks/middleware/timeline';
import { getArchitectIntl } from '~/i18n/imperative';
import type { ProtocolSourceRef } from '~/templates';
import { navigateApp } from '~/utils/appBase';
import {
  saveProtocolAssets,
  saveProtocolAssetsToMemory,
} from '~/utils/assetUtils';
import {
  armInMemoryUnloadGuard,
  disarmInMemoryUnloadGuard,
} from '~/utils/beforeUnloadGuard';
import {
  downloadProtocolAsNetcanvas,
  UnresolvedAssetsError,
} from '~/utils/bundleProtocol';
import {
  setExportInProgress,
  setImportInProgress,
} from '~/utils/criticalOperation';
import { describeMigrationFailure } from '~/utils/describeMigrationFailure';
import {
  assertCompressedSizeWithinLimit,
  loadGuardedNetcanvas,
  NetcanvasTooLargeError,
} from '~/utils/netcanvasSizeGuard';
import {
  type LocalizedText,
  describeImportFailure,
  getImportFailureKind,
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
const extraMessages = defineMessages({
  failed: {
    id: 'architect.protocolActions.failed',
    defaultMessage: 'Failed to Open Protocol',
    description: 'Researcher-facing Architect control or feedback.',
  },
  unsupported: {
    id: 'architect.protocolActions.unsupported',
    defaultMessage: 'Unsupported file type. Please open a .netcanvas file.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  migrationFailed: {
    id: 'architect.protocolActions.migrationFailed',
    defaultMessage: 'Protocol migration failed.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  importError: {
    id: 'architect.protocolActions.importError',
    defaultMessage: 'Protocol Import Error',
    description: 'Researcher-facing Architect control or feedback.',
  },
  notFound: {
    id: 'architect.protocolActions.notFound',
    defaultMessage: 'Protocol Not Found',
    description: 'Researcher-facing Architect control or feedback.',
  },
  missing: {
    id: 'architect.protocolActions.missing',
    defaultMessage: 'This protocol could not be found in your library.',
    description: 'Researcher-facing Architect control or feedback.',
  },
  openError: {
    id: 'architect.protocolActions.openError',
    defaultMessage: 'Protocol Open Error',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

type ImportSource = 'local' | 'bundled' | 'sketch';

export type ProtocolOpenResult =
  | {
      status: 'opened';
      /**
       * Resources the archive declared but did not contain, by the name the
       * researcher gave them.
       *
       * The protocol opens anyway. Refusing it would leave them with a file
       * only the tool that broke it can repair, when everything except those
       * files is intact and re-supplying one is a drag-and-drop away. The
       * names are here so the open can say which.
       */
      unresolvedAssetNames?: string[];
    }
  | {
      status: 'error';
      title: string;
      localizedTitle?: LocalizedText;
      localizedMessage?: LocalizedText;
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

// An import failed for a reason other than schema validation.
//
// A failure Architect can describe — a damaged or over-large archive, a
// protocol too old to upgrade, a device that will not store it — is an outcome
// of the file the researcher chose, not a defect. Those are recorded as an
// event carrying only the failure kind, a fixed vocabulary: `error_message`
// would carry researcher-authored resource names (a missing asset's failure
// names it), the same leak `trackImportValidationFailure` avoids, and routing
// them to exception tracking buries the failures that really are Architect's.
//
// Everything else is a bug, and is reported as an exception.
const trackImportFailure = (source: ImportSource, error: unknown) => {
  const kind = getImportFailureKind(error);

  if (kind !== null) {
    posthog.capture('protocol_import_failed', {
      source,
      reason: 'file',
      error_kind: kind,
    });
    return;
  }

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
  // Replace the current history entry instead of pushing: an open that starts
  // on a one-shot route (Sketch's /import-from-sketch) must not leave that
  // route reachable by Back, where it would remount and wait for a payload
  // that never comes.
  { replaceHistory = false }: { replaceHistory?: boolean } = {},
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
    navigateApp('/protocol', { replace: replaceHistory });
    return;
  }

  // The protocol persisted successfully, so clear any earlier storage-unavailable
  // flag (it is persisted to localStorage) to re-enable canonical persistence
  // for this and subsequent opens, and drop the in-memory unload warning.
  dispatch(setStorageUnavailable(false));
  disarmInMemoryUnloadGuard();
  dispatch(setActiveProtocolId(protocolId));
  dispatch(setActiveProtocol(protocol));

  navigateApp('/protocol', { replace: replaceHistory });
};

type OpenLocalNetcanvasParams = {
  file: File;
  migrationApproved?: boolean;
};

export const openLocalNetcanvas = createAppAsyncThunk(
  'protocol/openLocalNetcanvas',
  async (
    { file, migrationApproved = false }: OpenLocalNetcanvasParams,
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
          title: getArchitectIntl().formatMessage(extraMessages.failed),
          localizedTitle: { message: extraMessages.failed },
          message: getArchitectIntl().formatMessage(extraMessages.unsupported),
          localizedMessage: { message: extraMessages.unsupported },
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
          // Tracked here as well as at the catch below: this return is taken
          // before it, so without this the kind would be one the tracker
          // claims to record and never does.
          trackImportFailure('local', error);
          return {
            status: 'error',
            title: getArchitectIntl().formatMessage(extraMessages.failed),
            localizedTitle: { message: extraMessages.failed },
            ...describeImportFailure(
              error,
              PROTOCOL_OPEN_FAILURE_MESSAGE,
              getArchitectIntl(),
            ),
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
      // A manifest entry whose file is absent from the archive. Architect
      // opens the protocol without it rather than refusing the whole file:
      // everything else is intact, and the researcher can supply the file
      // again from Resources. Export refuses until they do, so an incomplete
      // protocol cannot travel any further.
      let missingAssets: Awaited<
        ReturnType<typeof extractProtocolFromZip>
      >['missingAssets'];
      try {
        ({ protocol, assets, missingAssets } =
          await extractProtocolFromZip(guardedZip));
      } catch (error) {
        if (error instanceof NetcanvasInflationLimitError) {
          trackImportFailure('local', error);
          return {
            status: 'error',
            title: getArchitectIntl().formatMessage(extraMessages.failed),
            localizedTitle: { message: extraMessages.failed },
            ...describeImportFailure(
              error,
              PROTOCOL_OPEN_FAILURE_MESSAGE,
              getArchitectIntl(),
            ),
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
        source: 'local',
      });

      if (migrationResult.status !== 'ready') {
        return migrationResult.result;
      }

      const migratedProtocol = migrationResult.protocol;

      // Validate the protocol
      const validationResult = await validateProtocol(
        migratedProtocol as CurrentProtocol,
      );

      if (!validationResult.success) {
        trackImportValidationFailure('local', validationResult.error);
        const errorMessage = ensureError(validationResult.error).message;
        return { status: 'validation-error', message: errorMessage };
      }

      const finalProtocol = migratedProtocol as CurrentProtocol;
      await instantiateProtocol(
        {
          protocol: finalProtocol,
          assets,
          name: finalProtocol.name ?? protocolName,
          description: finalProtocol.description,
        },
        storeDispatch,
      );

      if (missingAssets.length > 0) {
        return {
          status: 'opened',
          unresolvedAssetNames: missingAssets.map((asset) => asset.name),
        };
      }
      return openedResult;
    } catch (error) {
      trackImportFailure('local', error);
      // The raw error still reaches exception reporting and the console above;
      // what the dialog leads with is Architect's own description of it, and
      // the raw text is offered only behind the technical-details disclosure.
      const { message, detail, localizedMessage } = describeImportFailure(
        error,
        PROTOCOL_OPEN_FAILURE_MESSAGE,
        getArchitectIntl(),
      );
      return {
        status: 'error',
        title: getArchitectIntl().formatMessage(extraMessages.failed),
        localizedTitle: { message: extraMessages.failed },
        message,
        detail,
        localizedMessage,
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
  source,
}: {
  protocol: CurrentProtocol;
  name: string;
  approved: boolean;
  source: ImportSource;
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

      // `migrateProtocol` re-validates its output and THROWS when the result
      // does not satisfy the current schema. Unhandled, that reached the
      // researcher as a bare "Protocol migration failed." — their instrument
      // would not open and nothing said why. See `describeMigrationFailure`.
      try {
        const migratedProtocol = migrateProtocol(protocol, APP_SCHEMA_VERSION, {
          name,
        });
        return {
          status: 'ready',
          protocol: migratedProtocol as CurrentProtocol,
        };
      } catch (caught) {
        // The only place the thrown error still exists — the result below
        // describes it for a dialog and drops it. A migration step that throws
        // because of a bug in it is re-raised as `MigrationStepError`, which
        // `getImportFailureKind` deliberately does not treat as the file's
        // fault, so this is what puts our own migration defects in front of us.
        trackImportFailure(source, caught);
        const { title, message, detail } = describeMigrationFailure(
          ensureError(caught),
          protocol,
          getArchitectIntl(),
        );
        return {
          status: 'needs-ui',
          result: { status: 'error', title, message, detail },
        };
      }
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
          title: getArchitectIntl().formatMessage(extraMessages.failed),
          localizedTitle: { message: extraMessages.failed },
          message: getArchitectIntl().formatMessage(
            extraMessages.migrationFailed,
          ),
          localizedMessage: { message: extraMessages.migrationFailed },
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

type InMemoryProtocolInput = {
  protocol: CurrentProtocol;
  name?: string;
  assets?: ExtractedAsset[];
  sourceRef?: ProtocolSourceRef;
};

// Shared by every open whose protocol is already an in-memory object at the
// current schema version (a bundled template, a protocol sent from Sketch): no
// archive to extract and no migration, so it is validated directly. Each open
// creates a fresh library entry (new id), so the same protocol can be opened
// repeatedly without overwriting earlier copies.
//
// `source` tags analytics and `fallbackMessage` is what the researcher reads
// when the failure has no more specific description.
const openInMemoryProtocol = async (
  { protocol, name, assets, sourceRef }: InMemoryProtocolInput,
  {
    source,
    fallbackMessage,
    replaceHistory,
  }: {
    source: ImportSource;
    fallbackMessage: string;
    replaceHistory?: boolean;
  },
  dispatch: Dispatch,
): Promise<ProtocolOpenResult> => {
  // Signal an import is in flight so a fresh-load service-worker update won't
  // silently reload mid-import (which could leave a library row whose bundled
  // assets were never written). Mirrors openLocalNetcanvas.
  setImportInProgress(true);
  try {
    const finalProtocol = name ? { ...protocol, name } : protocol;
    const validationResult = await validateProtocol(finalProtocol);

    if (!validationResult.success) {
      trackImportValidationFailure(source, validationResult.error);
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
      { replaceHistory },
    );

    return openedResult;
  } catch (error) {
    trackImportFailure(source, error);
    // An in-memory protocol never opens an archive, so the file-shaped reasons
    // are unreachable here — but storage failures are not, and the default
    // must never talk about a damaged file.
    const { message, detail, localizedMessage } = describeImportFailure(
      error,
      fallbackMessage,
      getArchitectIntl(),
    );
    return {
      status: 'error',
      title: getArchitectIntl().formatMessage(extraMessages.importError),
      localizedTitle: { message: extraMessages.importError },
      message,
      detail,
      localizedMessage,
    };
  } finally {
    setImportInProgress(false);
  }
};

// Open one of the app's bundled research templates.
export const openBundledTemplate = createAppAsyncThunk(
  'webUserActions/openBundledTemplate',
  async (
    input: InMemoryProtocolInput,
    { dispatch },
  ): Promise<ProtocolOpenResult> =>
    openInMemoryProtocol(
      input,
      { source: 'bundled', fallbackMessage: TEMPLATE_OPEN_FAILURE_MESSAGE },
      dispatch,
    ),
);

// Open a protocol sent from Sketch (see components/SketchImport). Sketch emits
// the current schema version, so this is the bundled-template path under its
// own analytics source and protocol wording. It takes no `sourceRef`: a Sketch
// protocol has no canonical source file to save back to.
//
// Sketch is a separate deploy, so its schema version is checked first:
// `validateProtocol` accepts every schema it knows, and the in-memory path
// would otherwise store an older or newer protocol as the current one. A newer
// schema gets the "update Architect" result; an older one is a Sketch/Architect
// version skew, not a file to migrate, so it is refused.
//
// The editor replaces the /import-from-sketch history entry (see
// `instantiateProtocol`).
export const openSketchProtocol = createAppAsyncThunk(
  'webUserActions/openSketchProtocol',
  async (
    {
      protocol,
      name,
      assets,
    }: { protocol: CurrentProtocol; name: string; assets: ExtractedAsset[] },
    { dispatch },
  ): Promise<ProtocolOpenResult> => {
    // `protocol` is an unchecked postMessage payload: a missing or non-numeric
    // version is left to validation, which rejects it, rather than read as
    // "newer than this app".
    const versionState =
      typeof (protocol as { schemaVersion?: unknown }).schemaVersion ===
      'number'
        ? checkSchemaVersion(protocol)
        : schemaVersionStates.OK;
    if (versionState === schemaVersionStates.UPGRADE_APP) {
      return {
        status: 'app-upgrade-required',
        protocolSchemaVersion: protocol.schemaVersion,
      };
    }
    if (versionState !== schemaVersionStates.OK) {
      return {
        status: 'validation-error',
        message: `Sketch sent a schema ${protocol.schemaVersion} protocol; this Architect expects schema ${APP_SCHEMA_VERSION}.`,
      };
    }
    const result = await openInMemoryProtocol(
      { protocol, name, assets },
      {
        source: 'sketch',
        fallbackMessage: PROTOCOL_OPEN_FAILURE_MESSAGE,
        replaceHistory: true,
      },
      dispatch,
    );
    if (result.status !== 'opened') return result;
    // Like a .netcanvas missing an archive entry, a manifest file Sketch did
    // not send opens anyway, and the result names it.
    const delivered = new Set(assets.map((asset) => asset.id));
    const unresolvedAssetNames = Object.entries(protocol.assetManifest ?? {})
      .filter(
        ([assetId, definition]) =>
          definition.type !== 'apikey' && !delivered.has(assetId),
      )
      .map(([, definition]) => definition.name);
    return unresolvedAssetNames.length > 0
      ? { status: 'opened', unresolvedAssetNames }
      : result;
  },
);

// Export protocol as .netcanvas file.
//
// `protocol` overrides the canonical protocol where the file must not be it:
// rescuing an uncommitted stage draft, or a read-only tab exporting the saved
// library row. It changes nothing on disk or in the library. `protocolId` names
// the library entry whose assets the file bundles; it defaults to the active
// protocol's id, and a caller that read a row by id passes that id, because
// the active id can change while the row is being read.
type ExportNetcanvasOptions = {
  protocol?: CurrentProtocol;
  protocolId?: string;
};

export const exportNetcanvas = createAppAsyncThunk(
  'webUserActions/exportNetcanvas',
  async (options: ExportNetcanvasOptions | undefined, { getState }) => {
    const state = getState();
    const protocol = options?.protocol ?? state.activeProtocol?.present;

    if (!protocol) {
      throw new Error('No active protocol to export');
    }

    // Signal an export is in flight so a service-worker update reload warns/defers
    // rather than interrupting the download.
    setExportInProgress(true);
    try {
      await downloadProtocolAsNetcanvas(
        protocol as CurrentProtocol,
        protocol.name,
        options?.protocolId ?? getActiveProtocolId(state) ?? undefined,
      );
      return { status: 'exported' } as const;
    } catch (error) {
      // Returned rather than rethrown because `.unwrap()` gives the caller a
      // serialized copy of the error, not the instance — the class is gone by
      // the time a dialog could ask about it. The resource names are what the
      // researcher needs, so they travel as data.
      if (error instanceof UnresolvedAssetsError) {
        return { status: 'unresolved-assets', assetNames: error.assetNames };
      }
      throw error;
    } finally {
      setExportInProgress(false);
    }
  },
);

// Load a protocol already saved in the library into the editing buffer. Its
// assets are already namespaced under this id in IndexedDB.
//
// Schema compatibility is decided by `admitStoredProtocol`, shared with the
// startup session restore, so a library protocol behaves the same however it is
// reached. Note that this path has NO migration approval dialog and needs none:
// unlike `openLocalNetcanvas`, which migrates a file into a new library entry
// and leaves the researcher's own copy on disk untouched, there is no second
// copy here to fall back to.
export const openLibraryProtocol = createAppAsyncThunk(
  'webUserActions/openLibraryProtocol',
  async ({ id }: { id: string }, { dispatch }): Promise<ProtocolOpenResult> => {
    let row: Awaited<ReturnType<typeof getStoredProtocol>>;
    try {
      row = await getStoredProtocol(id);
    } catch (error: unknown) {
      // The library itself could not be read (storage blocked or broken).
      // Described like any other refusal, so every caller shows a dialog
      // rather than failing silently.
      reportError(error, { operation: 'stored-protocol-read' });
      const { message, detail, localizedMessage } = describeImportFailure(
        error,
        PROTOCOL_OPEN_FAILURE_MESSAGE,
        getArchitectIntl(),
      );
      return {
        status: 'error',
        title: getArchitectIntl().formatMessage(extraMessages.openError),
        localizedTitle: { message: extraMessages.openError },
        message,
        detail,
        localizedMessage,
      };
    }
    if (!row) {
      return {
        status: 'error',
        title: getArchitectIntl().formatMessage(extraMessages.notFound),
        localizedTitle: { message: extraMessages.notFound },
        message: getArchitectIntl().formatMessage(extraMessages.missing),
        localizedMessage: { message: extraMessages.missing },
      };
    }

    let admission: Awaited<ReturnType<typeof admitStoredProtocol>>;
    try {
      admission = await admitStoredProtocol(row, undefined, getArchitectIntl());
    } catch (error: unknown) {
      // Reported even when `getImportFailureKind` can classify it, unlike the
      // import paths. A library row is Architect's own output, written from a
      // document it had already migrated and validated, so "this protocol
      // cannot be upgraded" here does not describe a file the researcher
      // chose — it means Architect stored something it can no longer read.
      reportError(error, { operation: 'stored-protocol-admission' });
      const { message, detail, localizedMessage } = describeImportFailure(
        error,
        PROTOCOL_OPEN_FAILURE_MESSAGE,
        getArchitectIntl(),
      );
      return {
        status: 'error',
        title: getArchitectIntl().formatMessage(extraMessages.openError),
        localizedTitle: { message: extraMessages.openError },
        message,
        detail,
        localizedMessage,
      };
    }

    // Every refusal is already described as a protocol-open result, so the
    // dialog a researcher sees for a stored protocol is the one the import path
    // would have shown them for the same problem.
    if (!admission.success) {
      return admission.refusal;
    }

    // This protocol is loaded from durable storage, so any earlier in-memory
    // unload warning/storage failure no longer applies.
    dispatch(setStorageUnavailable(false));
    disarmInMemoryUnloadGuard();
    dispatch(setActiveProtocolId(id));
    // The admitted document, which is the upgraded one when the row was below
    // this build's schema — `row.protocol` is stale by then.
    dispatch(setActiveProtocol(admission.protocol));
    navigateApp('/protocol');
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
