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
import { appUpgradeRequiredDialog, mayUpgradeProtocolDialog } from "~/ducks/modules/userActions/dialogs";
import type { RootState } from "~/ducks/store";
import { getHasUnsavedChanges, getTimelineLocus } from "~/selectors/protocol";
import { saveProtocolAssets } from "~/utils/assetUtils";
import { downloadProtocolAsNetcanvas } from "~/utils/bundleProtocol";
import { markProtocolSaved, setActiveProtocol } from "../activeProtocol";
import { openDialog } from "../dialogs";

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
			throw new Error(`Protocol validation failed: ${validationResult.error}`);
		}

		// Add protocol assets to IndexedDB
		await saveProtocolAssets(assets);

		dispatch(
			setActiveProtocol({
				...(migratedProtocol as CurrentProtocol),
				name: file.name.replace(/\.netcanvas$/, ""),
			}),
		);

		navigate("/protocol");
	} catch (_error) {
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
				const migrationNotes = getMigrationInfo(protocol.schemaVersion, APP_SCHEMA_VERSION);
				const upgradeDialog = mayUpgradeProtocolDialog(protocol.schemaVersion, APP_SCHEMA_VERSION, [migrationNotes]);

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

	// Add to protocols store
	dispatch(
		setActiveProtocol({
			...(newProtocol as CurrentProtocol),
			name: "New Protocol",
		}),
	);

	// Navigate to the protocol
	navigate("/protocol");
});

// Save protocol (validate and mark as saved)
export const saveProtocol = createAsyncThunk("webUserActions/saveProtocol", async (_, { getState, dispatch }) => {
	const state = getState() as RootState;
	const protocol = state.activeProtocol?.present;

	if (!protocol) {
		throw new Error("No active protocol to save");
	}

	// Validate the protocol
	const validationResult = await validateProtocol(protocol as CurrentProtocol);

	if (!validationResult.success) {
		// Show validation error dialog
		await dispatch(
			openDialog({
				type: "Error",
				message: `Cannot Save Protocol\n\nProtocol has validation errors:\n\n${validationResult.error}`,
				confirmLabel: "OK",
			}),
		).unwrap();
		throw new Error(`Protocol validation failed: ${validationResult.error}`);
	}

	// Get current timeline locus
	const timelineLocus = getTimelineLocus(state);

	if (!timelineLocus) {
		throw new Error("No timeline locus available");
	}

	// Mark protocol as saved
	const timestamp = Date.now();
	dispatch(markProtocolSaved({ timestamp, timelineLocus }));

	return { timestamp, timelineLocus };
});

// Export protocol as .netcanvas file
export const exportNetcanvas = createAsyncThunk("webUserActions/exportNetcanvas", async (_, { getState }) => {
	const state = getState() as RootState;
	const protocol = state.activeProtocol?.present;

	if (!protocol) {
		throw new Error("No active protocol to export");
	}
	await downloadProtocolAsNetcanvas(protocol as CurrentProtocol);
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
				throw new Error(`Protocol validation failed: ${validationResult.error}`);
			}

			// Add protocol assets to IndexedDB
			await saveProtocolAssets(assets);

			// Get filename from URL
			const fileName = url.split("/").pop() || "remote_protocol.netcanvas";

			dispatch(
				setActiveProtocol({
					...(migratedProtocol as CurrentProtocol),
					name: fileName.replace(/\.netcanvas$/, ""),
				}),
			);

			navigate("/protocol");
		} catch (_error) {
		} finally {
			controller.abort();
		}
	},
);

export const openRemoteFrescoNetcanvas = createAsyncThunk(
	"webUserActions/openRemoteFrescoNetcanvas",
	async (_url: string, { dispatch }) => {},
);
