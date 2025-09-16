import type { Protocol } from "@codaco/protocol-validation";
import { extractProtocol, getMigrationNotes, migrateProtocol, validateProtocol } from "@codaco/protocol-validation";
import { createAsyncThunk } from "@reduxjs/toolkit";
import { navigate } from "wouter/use-browser-location";
import { UnsavedChanges } from "~/components/Dialogs";
import { APP_SCHEMA_VERSION } from "~/config";
import { appUpgradeRequiredDialog, mayUpgradeProtocolDialog } from "~/ducks/modules/userActions/dialogs";
import type { AppDispatch, RootState } from "~/ducks/store";
import { getHasUnsavedChanges } from "~/selectors/protocol";
import { saveProtocolAssets } from "~/utils/assetUtils";
import { setActiveProtocol } from "../activeProtocol";
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

	console.log("Opening protocol file...");
	try {
		const fileName = file.name.toLowerCase();

		if (!fileName.endsWith(".netcanvas")) {
			throw new Error("Unsupported file type. Please open a .netcanvas file.");
		}

		const arrayBuffer = await file.arrayBuffer();
		const { protocol, assets } = await extractProtocol(new Uint8Array(arrayBuffer));

		// Handle migration if needed
		const migratedProtocol = await dispatch(handleProtocolMigration(protocol)).unwrap();

		if (!migratedProtocol) {
			throw new Error("Protocol migration failed or was canceled.");
		}

		console.log("Protocol migration complete:", migratedProtocol);

		// Validate the protocol
		const validationResult = await validateProtocol(migratedProtocol);

		if (!validationResult.isValid) {
			throw new Error(
				`Protocol validation failed: ${[...validationResult.logicErrors, ...validationResult.schemaErrors].map((error) => error.message).join(", ")}`,
			);
		}

		// Add protocol assets to IndexedDB
		await saveProtocolAssets(assets);

		dispatch(
			setActiveProtocol({
				...protocol,
				name: file.name.replace(/\.netcanvas$/, ""),
			}),
		);

		navigate("/protocol");
	} catch (error) {
		console.error("Error reading protocol file:", error);
		return false;
	}
});

const schemaVersionStates = {
	OK: "OK",
	UPGRADE_PROTOCOL: "UPGRADE_PROTOCOL",
	UPGRADE_APP: "UPGRADE_APP",
} as const;

type schemaVersionStates = (typeof schemaVersionStates)[keyof typeof schemaVersionStates];

const checkSchemaVersion = (protocol: Protocol): schemaVersionStates => {
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
const handleProtocolMigration = createAsyncThunk("protocol/openOrUpgrade", async (protocol: Protocol, { dispatch }) => {
	try {
		const schemaVersionStatus = checkSchemaVersion(protocol);
		switch (schemaVersionStatus) {
			case schemaVersionStates.OK: {
				return protocol;
			}
			case schemaVersionStates.UPGRADE_PROTOCOL: {
				const migrationNotes = getMigrationNotes(protocol.schemaVersion, APP_SCHEMA_VERSION);
				const upgradeDialog = mayUpgradeProtocolDialog(protocol.schemaVersion, APP_SCHEMA_VERSION, migrationNotes);

				const confirm = await dispatch(upgradeDialog).unwrap();
				if (!confirm) {
					return false;
				}

				const migratedProtocol = await migrateProtocol(protocol, APP_SCHEMA_VERSION);
				return migratedProtocol as Protocol;
			}
			case schemaVersionStates.UPGRADE_APP:
				await dispatch(appUpgradeRequiredDialog(protocol.schemaVersion));
				return false;
			default:
				return false;
		}
	} catch (e) {
		console.error("Error opening protocol:", e);
		throw e;
	}
});

// Create a new protocol
export const createNetcanvas = createAsyncThunk("webUserActions/createNetcanvas", async (_, { dispatch }) => {
	const proceed = await dispatch(checkUnsavedChanges()).unwrap();
	if (!proceed) {
		return null;
	}

	// TODO: prompt for protocol name and description

	// Create a new empty protocol
	const newProtocol: Protocol = {
		schemaVersion: APP_SCHEMA_VERSION,
		stages: [],
		codebook: {
			node: {},
			edge: {},
			ego: {},
		},
		assetManifest: {},
	} as Protocol;

	// Add to protocols store
	dispatch(
		setActiveProtocol({
			...newProtocol,
			name: "New Protocol",
		}),
	);

	// Navigate to the protocol
	navigate("/protocol");
});

// Export protocol as file
export const exportNetcanvas = () => async (_dispatch: AppDispatch, getState: () => RootState) => {
	const state = getState();
	const protocol = state.activeProtocol?.present;

	if (!protocol) {
		console.error("No active protocol to export");
		return;
	}

	// TODO: Implement asset retrieval and zip generation.

	// Create a downloadable file
	const protocolJson = JSON.stringify(protocol, null, 2);
	const blob = new Blob([protocolJson], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = document.createElement("a");
	a.href = url;
	a.download = `${protocol.name}.netcanvas`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};

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
			const { protocol, assets } = await extractProtocol(buffer);

			// Handle migration if needed
			const migratedProtocol = await dispatch(handleProtocolMigration(protocol)).unwrap();

			if (!migratedProtocol) {
				throw new Error("Protocol migration failed or was canceled.");
			}

			// Validate the protocol
			const validationResult = await validateProtocol(migratedProtocol);

			if (!validationResult.isValid) {
				throw new Error(
					`Protocol validation failed: ${[...validationResult.logicErrors, ...validationResult.schemaErrors].map((error) => error.message).join(", ")}`,
				);
			}

			// Add protocol assets to IndexedDB
			await saveProtocolAssets(assets);

			// Get filename from URL
			const fileName = url.split("/").pop() || "remote_protocol.netcanvas";

			dispatch(
				setActiveProtocol({
					...protocol,
					name: fileName.replace(/\.netcanvas$/, ""),
				}),
			);

			navigate("/protocol");
		} catch (error) {
			console.error("Error opening remote Netcanvas:", error);
		} finally {
			controller.abort();
		}
	},
);

export const openRemoteFrescoNetcanvas = createAsyncThunk(
	"webUserActions/openRemoteFrescoNetcanvas",
	async (url: string, { dispatch }) => {
		console.log("Not implemented yet for remote Fresco Netcanvas");
	},
);
