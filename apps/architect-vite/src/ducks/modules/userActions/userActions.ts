import {
	type CurrentProtocol,
	extractProtocol,
	getMigrationInfo,
	migrateProtocol,
	validateProtocol,
} from "@codaco/protocol-validation";
import { createAsyncThunk } from "@reduxjs/toolkit";
import { navigate } from "wouter/use-browser-location";
import { UnsavedChanges } from "~/components/Dialogs";
import { APP_SCHEMA_VERSION } from "~/config";
import {
	appUpgradeRequiredDialog,
	generalErrorDialog,
	mayUpgradeProtocolDialog,
	validationErrorDialog,
} from "~/ducks/modules/userActions/dialogs";
import type { RootState } from "~/ducks/store";
import { getHasUnsavedChanges } from "~/selectors/protocol";
import { saveProtocolAssets } from "~/utils/assetUtils";
import { downloadProtocolAsNetcanvas } from "~/utils/bundleProtocol";
import { ensureError } from "~/utils/ensureError";
import { clearActiveProtocol, setActiveProtocol } from "../activeProtocol";
import { openDialog } from "../dialogs";
import { clearProtocolMeta, setProtocolMeta } from "../protocolMeta";

export const checkUnsavedChanges = createAsyncThunk(
	"webUserActions/checkUnsavedChanges",
	async (_, { dispatch, getState }) => {
		const state = getState() as RootState;
		const hasUnsavedChanges = getHasUnsavedChanges(state);

		if (!hasUnsavedChanges) {
			return true;
		}

		const confirm = await dispatch(openDialog(UnsavedChanges({}))).unwrap();

		return confirm;
	},
);

export const openLocalNetcanvas = createAsyncThunk("protocol/openLocalNetcanvas", async (file: File, { dispatch }) => {
	const proceed = await dispatch(checkUnsavedChanges()).unwrap();
	if (!proceed) {
		return;
	}
	try {
		const fileName = file.name.toLowerCase();

		if (!fileName.endsWith(".netcanvas")) {
			throw new Error("Unsupported file type. Please open a .netcanvas file.");
		}

		const arrayBuffer = await file.arrayBuffer();
		const { protocol, assets } = await extractProtocol(new Uint8Array(arrayBuffer));

		// Handle migration if needed
		const migratedProtocol = await dispatch(handleProtocolMigration(protocol as CurrentProtocol)).unwrap();

		if (!migratedProtocol) {
			throw new Error("Protocol migration failed or was canceled.");
		}

		// Validate the protocol
		const validationResult = await validateProtocol(migratedProtocol as CurrentProtocol);

		if (!validationResult.success) {
			const errorMessage = ensureError(validationResult.error).message;
			dispatch(validationErrorDialog(errorMessage));
			return false;
		}

		// Add protocol assets to IndexedDB
		await saveProtocolAssets(assets);

		dispatch(setActiveProtocol(migratedProtocol as CurrentProtocol));
		dispatch(setProtocolMeta({ name: file.name.replace(/\.netcanvas$/, "") }));

		navigate("/protocol");
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		dispatch(generalErrorDialog("Failed to Open Protocol", errorMessage));
		return false;
	}
});

const schemaVersionStates = {
	OK: "OK",
	UPGRADE_PROTOCOL: "UPGRADE_PROTOCOL",
	UPGRADE_APP: "UPGRADE_APP",
} as const;

type schemaVersionStates = (typeof schemaVersionStates)[keyof typeof schemaVersionStates];

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
	"protocol/openOrUpgrade",
	async (protocol: CurrentProtocol, { dispatch }) => {
		const schemaVersionStatus = checkSchemaVersion(protocol);
		switch (schemaVersionStatus) {
			case schemaVersionStates.OK: {
				return protocol;
			}
			case schemaVersionStates.UPGRADE_PROTOCOL: {
				const migrationInfo = getMigrationInfo(protocol.schemaVersion, APP_SCHEMA_VERSION);
				const upgradeDialog = mayUpgradeProtocolDialog(protocol.schemaVersion, APP_SCHEMA_VERSION, migrationInfo.notes);

				const confirm = await dispatch(upgradeDialog).unwrap();
				if (!confirm) {
					return false;
				}

				const migratedProtocol = migrateProtocol(protocol, APP_SCHEMA_VERSION);
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

// Create a new protocol
export const createNetcanvas = createAsyncThunk("webUserActions/createNetcanvas", async (_, { dispatch }) => {
	const proceed = await dispatch(checkUnsavedChanges()).unwrap();
	if (!proceed) {
		return null;
	}

	// TODO: prompt for protocol name and description

	// Create a new empty protocol
	const newProtocol: CurrentProtocol = {
		schemaVersion: APP_SCHEMA_VERSION,
		stages: [],
		codebook: {
			node: {},
			edge: {},
			ego: {},
		},
		assetManifest: {},
	} as CurrentProtocol;

	// Set active protocol and metadata
	dispatch(setActiveProtocol(newProtocol as CurrentProtocol));
	dispatch(setProtocolMeta({ name: "New Protocol" }));

	// Navigate to the protocol
	navigate("/protocol");
});

// Export protocol as .netcanvas file
export const exportNetcanvas = createAsyncThunk("webUserActions/exportNetcanvas", async (_, { getState }) => {
	const state = getState() as RootState;
	const protocol = state.activeProtocol?.present;
	const protocolName = state.protocolMeta?.name;

	if (!protocol) {
		throw new Error("No active protocol to export");
	}
	await downloadProtocolAsNetcanvas(protocol as CurrentProtocol, protocolName);
	return true;
});

export const openRemoteNetcanvas = createAsyncThunk(
	"webUserActions/openRemoteNetcanvas",
	async (url: string, { dispatch }) => {
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
			const { protocol, assets } = await extractProtocol(new Uint8Array(buffer));

			// Handle migration if needed
			const migratedProtocol = await dispatch(handleProtocolMigration(protocol as CurrentProtocol)).unwrap();

			if (!migratedProtocol) {
				throw new Error("Protocol migration failed or was canceled.");
			}

			// Validate the protocol
			const validationResult = await validateProtocol(migratedProtocol as CurrentProtocol);

			if (!validationResult.success) {
				const errorMessage = ensureError(validationResult.error).message;
				dispatch(validationErrorDialog(errorMessage));
				return;
			}

			// Add protocol assets to IndexedDB
			await saveProtocolAssets(assets);

			// Get filename from URL
			const fileName = url.split("/").pop() || "remote_protocol.netcanvas";

			dispatch(setActiveProtocol(migratedProtocol as CurrentProtocol));
			dispatch(setProtocolMeta({ name: fileName.replace(/\.netcanvas$/, "") }));

			navigate("/protocol");
		} catch (error) {
			const errorMessage = ensureError(error).message;
			dispatch(generalErrorDialog("Protocol Import Error", errorMessage));
		} finally {
			controller.abort();
		}
	},
);
