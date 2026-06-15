import { createAsyncThunk, type Dispatch } from '@reduxjs/toolkit';
import { navigate } from 'wouter/use-browser-location';

import {
  type CurrentProtocol,
  type ExtractedAsset,
  extractProtocol,
  getMigrationInfo,
  migrateProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { APP_SCHEMA_VERSION } from '~/config';
import {
  appUpgradeRequiredDialog,
  generalErrorDialog,
  mayUpgradeProtocolDialog,
  validationErrorDialog,
} from '~/ducks/modules/userActions/dialogs';
import type { RootState } from '~/ducks/store';
import { saveProtocolAssets } from '~/utils/assetUtils';
import { downloadProtocolAsNetcanvas } from '~/utils/bundleProtocol';
import { ensureError } from '~/utils/ensureError';
import {
  deleteStoredProtocol,
  getStoredProtocol,
  putStoredProtocol,
} from '~/utils/protocolLibrary';

import { clearActiveProtocol, setActiveProtocol } from '../activeProtocol';
import { getActiveProtocolId, setActiveProtocolId } from '../app';

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

  await putStoredProtocol({ id: protocolId, protocol, name, description });
  try {
    await saveProtocolAssets(assets, protocolId);
  } catch (error) {
    // Don't leave a library row whose assetManifest points at assets that were
    // never persisted; remove the orphaned row before surfacing the failure.
    await deleteStoredProtocol(protocolId);
    throw error;
  }

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
        throw new Error(
          'Unsupported file type. Please open a .netcanvas file.',
        );
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
        throw new Error('Protocol migration failed or was canceled.');
      }

      // Validate the protocol
      const validationResult = await validateProtocol(
        migratedProtocol as CurrentProtocol,
      );

      if (!validationResult.success) {
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
    { protocol, name }: { protocol: CurrentProtocol; name?: string },
    { dispatch },
  ) => {
    const validationResult = await validateProtocol(protocol);

    if (!validationResult.success) {
      const errorMessage = ensureError(validationResult.error).message;
      dispatch(validationErrorDialog(errorMessage));
      return;
    }

    const finalName = name ?? protocol.name;
    await instantiateProtocol(
      {
        protocol: name ? { ...protocol, name } : protocol,
        name: finalName,
        description: protocol.description,
      },
      dispatch,
    );
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

export const openRemoteNetcanvas = createAsyncThunk(
  'webUserActions/openRemoteNetcanvas',
  async ({ url, name }: { url: string; name?: string }, { dispatch }) => {
    const controller = new AbortController();

    try {
      // Fetch the zipped .netcanvas file from the remote URL
      const response = await fetch(url, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();

      // TODO: Remove duplicated code by reusing openLocalNetcanvas logic
      const { protocol, assets } = await extractProtocol(
        new Uint8Array(buffer),
      );

      // Get filename from URL
      const fileName = decodeURIComponent(
        url.split('/').pop() || 'remote_protocol.netcanvas',
      );
      const protocolName = fileName.replace(/\.netcanvas$/, '');

      // Handle migration if needed
      const migratedProtocol = await dispatch(
        handleProtocolMigration({
          protocol: protocol as CurrentProtocol,
          name: protocolName,
        }),
      ).unwrap();

      if (!migratedProtocol) {
        throw new Error('Protocol migration failed or was canceled.');
      }

      // Validate the protocol
      const validationResult = await validateProtocol(
        migratedProtocol as CurrentProtocol,
      );

      if (!validationResult.success) {
        const errorMessage = ensureError(validationResult.error).message;
        dispatch(validationErrorDialog(errorMessage));
        return;
      }

      // Opening a remote/template protocol instantiates a fresh library entry
      // (new id), so templates can be opened repeatedly without overwriting. A
      // caller-supplied `name` (the template-naming flow) overrides the
      // protocol's own name so the library row and the editor agree.
      const finalProtocol = migratedProtocol as CurrentProtocol;
      const finalName = name ?? finalProtocol.name ?? protocolName;
      await instantiateProtocol(
        {
          protocol: name ? { ...finalProtocol, name } : finalProtocol,
          assets,
          name: finalName,
          description: finalProtocol.description,
        },
        dispatch,
      );
    } catch (error) {
      const errorMessage = ensureError(error).message;
      dispatch(generalErrorDialog('Protocol Import Error', errorMessage));
    } finally {
      controller.abort();
    }
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
