/* eslint-disable import/prefer-default-export */
import type { Protocol } from "@codaco/protocol-validation";
import { getMigrationNotes, validateProtocol } from "@codaco/protocol-validation";
import axios from "axios";
import JSZip from "jszip";
import { v4 as uuid } from "uuid";
import { navigate } from "wouter/use-browser-location";
import { UnsavedChanges } from "~/components/Dialogs";
import { APP_SCHEMA_VERSION, SAMPLE_PROTOCOL_URL } from "~/config";
import { actionCreators as activeProtocolActions } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogsActions } from "~/ducks/modules/dialogs";
import { addProtocol, generateProtocolId, updateProtocol } from "~/ducks/modules/protocols";
import { actionCreators as toastActions } from "~/ducks/modules/toasts";
import { createLock } from "~/ducks/modules/ui/status";
import {
	appUpgradeRequiredDialog,
	importErrorDialog,
	mayUpgradeProtocolDialog,
	validationErrorDialog,
} from "~/ducks/modules/userActions/dialogs";
import type { AppDispatch, RootState } from "~/ducks/store";
import { getHasUnsavedChanges } from "~/selectors/protocol";
import CancellationError from "~/utils/cancellationError";
import * as netcanvasFile from "~/utils/netcanvasFile";
import { createImportToast, updateDownloadProgress } from "./userActionToasts";
import { extractProtocolAssets } from "~/utils/assetUtils";

const protocolsLock = createLock("PROTOCOLS");
const loadingLock = createLock("LOADING");
const savingLock = createLock("SAVING");

const { schemaVersionStates } = netcanvasFile;

const checkUnsavedChanges = () => (dispatch: AppDispatch, getState: () => RootState) =>
	Promise.resolve()
		.then(() => getHasUnsavedChanges(getState()))
		.then((hasUnsavedChanges) => {
			if (!hasUnsavedChanges) {
				return Promise.resolve(true);
			}

			const unsavedChangesDialog = UnsavedChanges({
				confirmLabel: "Discard changes and continue",
			});

			return dispatch(dialogsActions.openDialog(unsavedChangesDialog)).then((confirm) => {
				if (!confirm) {
					return Promise.resolve(false);
				}

				return confirm;
			});
		});

const openProtocolFile = (): Promise<{ canceled: boolean; protocol?: Protocol; protocolId?: string }> => {
	console.log("Opening protocol file...");
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".netcanvas,.json";

		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			console.log("File selected:", file);
			if (!file) {
				resolve({ canceled: true });
				return;
			}

			try {
				const fileName = file.name.toLowerCase();

				if (fileName.endsWith(".netcanvas")) {
					// Handle .netcanvas ZIP file
					console.log("Processing .netcanvas ZIP file...");
					const arrayBuffer = await file.arrayBuffer();
					const zip = await JSZip.loadAsync(arrayBuffer);

					// Extract protocol.json
					const protocolFile = zip.file("protocol.json");
					if (!protocolFile) {
						throw new Error("protocol.json not found in .netcanvas file");
					}

					const protocolText = await protocolFile.async("string");
					const protocol = JSON.parse(protocolText) as Protocol;

					// Generate protocol ID for asset storage
					const protocolId = await generateProtocolId(protocol);

					// Extract and store assets using the utility function
					await extractProtocolAssets(protocol, zip, protocolId);

					resolve({ canceled: false, protocol, protocolId });
				} else {
					// Handle plain .json file
					console.log("Processing .json file...");
					const text = await file.text();
					const protocol = JSON.parse(text) as Protocol;
					resolve({ canceled: false, protocol });
				}
			} catch (error) {
				console.error("Error reading protocol file:", error);
				resolve({ canceled: true });
			}
		};

		input.oncancel = () => {
			resolve({ canceled: true });
		};

		input.click();
	});
};

// Updated to work with web-based approach
const openNetcanvas = protocolsLock(() => {
	// helper function so we can use loadingLock
	const openOrUpgrade = loadingLock(
		({
			canceled,
			protocol,
			protocolId: existingProtocolId,
		}: { canceled: boolean; protocol?: Protocol; protocolId?: string }) =>
			async (dispatch: AppDispatch) => {
				if (canceled || !protocol) {
					return null;
				}

				try {
					const [protocolSchemaVersion, schemaVersionStatus] = await netcanvasFile.checkSchemaVersion(protocol);

					switch (schemaVersionStatus) {
						case schemaVersionStates.OK: {
							// Use existing protocol ID if available (from .netcanvas file), otherwise generate new one
							const protocolId = existingProtocolId || (await generateProtocolId(protocol));
							const protocolName = protocol.name || "Untitled Protocol";

							// Add to protocols store
							dispatch(
								addProtocol({
									id: protocolId,
									protocol,
									name: protocolName,
									description: protocol.description,
								}),
							);

							// Set as active protocol
							dispatch(activeProtocolActions.setActiveProtocol(protocol));

							// Navigate to the protocol
							navigate(`/protocol/${protocolId}`);

							return protocolId;
						}
						case schemaVersionStates.UPGRADE_PROTOCOL: {
							const migrationNotes = getMigrationNotes(protocolSchemaVersion, APP_SCHEMA_VERSION);
							const upgradeDialog = mayUpgradeProtocolDialog(protocolSchemaVersion, APP_SCHEMA_VERSION, migrationNotes);

							const confirm = await dispatch(upgradeDialog);
							if (!confirm) {
								return null;
							}

							// TODO: Implement protocol migration for web
							console.warn("Protocol migration not yet implemented for web");
							return null;
						}
						case schemaVersionStates.UPGRADE_APP:
							await dispatch(appUpgradeRequiredDialog(protocolSchemaVersion));
							return null;
						default:
							return null;
					}
				} catch (e) {
					console.error("Error opening protocol:", e);
					throw e;
				}
			},
	);

	// actual dispatched action
	return async (dispatch: AppDispatch) => {
		try {
			const proceed = await dispatch(checkUnsavedChanges());
			if (!proceed) {
				return { canceled: true };
			}

			const { canceled, protocol, protocolId } = await openProtocolFile();
			return dispatch(openOrUpgrade({ canceled, protocol, protocolId }));
		} catch (e) {
			console.error("Error in openNetcanvas:", e);
			return null;
		}
	};
});

// Create a new protocol
const createNetcanvas = protocolsLock(() => async (dispatch: AppDispatch) => {
	const proceed = await dispatch(checkUnsavedChanges());
	if (!proceed) {
		return null;
	}

	// Create a new empty protocol
	const newProtocol: Protocol = {
		name: "New Protocol",
		schemaVersion: APP_SCHEMA_VERSION as 8,
		stages: [],
		codebook: {
			node: {},
			edge: {},
			ego: {},
		},
		assetManifest: {},
	};

	const protocolId = await generateProtocolId(newProtocol);

	// Add to protocols store
	dispatch(
		addProtocol({
			id: protocolId,
			protocol: newProtocol,
			name: newProtocol.name || "New Protocol",
			description: newProtocol.description,
		}),
	);

	// Set as active protocol
	dispatch(activeProtocolActions.setActiveProtocol(newProtocol));

	// Navigate to the protocol
	navigate(`/protocol/${protocolId}`);

	return protocolId;
});

// Save the current protocol
const saveNetcanvas = savingLock(() => async (dispatch: AppDispatch, getState: () => RootState) => {
	const state = getState();
	const protocol = state.activeProtocol?.protocol;
	const protocolId = state.activeProtocol?.id;

	if (!protocol || !protocolId) {
		console.error("No active protocol to save");
		return null;
	}

	try {
		await validateProtocol(protocol);
	} catch (e) {
		await dispatch(validationErrorDialog(e));
		throw e;
	}

	// Update the protocol in the protocols store
	dispatch(
		updateProtocol({
			id: protocolId,
			protocol,
		}),
	);

	// TODO: In a real web app, this would save to a backend API
	console.log("Protocol saved (to Redux store)");

	return protocolId;
});

// Export protocol as file
const exportNetcanvas = () => async (_dispatch: AppDispatch, getState: () => RootState) => {
	const state = getState();
	const protocol = state.activeProtocol?.protocol;

	if (!protocol) {
		console.error("No active protocol to export");
		return;
	}

	// Create a downloadable file
	const protocolJson = JSON.stringify(protocol, null, 2);
	const blob = new Blob([protocolJson], { type: "application/json" });
	const url = URL.createObjectURL(blob);

	const a = document.createElement("a");
	a.href = url;
	a.download = `${protocol.name || "protocol"}.netcanvas`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};

// Import sample protocol
const importSampleProtocol = () => async (dispatch: AppDispatch) => {
	const importUUID = uuid();
	let userCancelled = false;
	const controller = new AbortController();

	const handleCancel = () => {
		controller.abort();
		userCancelled = true;
		dispatch(toastActions.removeToast(importUUID));
	};

	const checkIfUserCancelled = <T>(value: T): T => {
		if (userCancelled) {
			throw new CancellationError();
		}
		return value;
	};

	try {
		await dispatch(createImportToast(importUUID, handleCancel));

		const response = await axios.get(SAMPLE_PROTOCOL_URL, {
			signal: controller.signal,
			responseType: "json",
			onDownloadProgress: (progressEvent) => {
				if (progressEvent.total) {
					const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
					dispatch(updateDownloadProgress(importUUID, percentCompleted));
				}
			},
		});

		checkIfUserCancelled(response);

		const protocol = response.data as Protocol;

		// Generate ID and store protocol
		const protocolId = await generateProtocolId(protocol);
		const protocolName = protocol.name || "Sample Protocol";

		// Add to protocols store
		dispatch(
			addProtocol({
				id: protocolId,
				protocol,
				name: protocolName,
				description: protocol.description,
			}),
		);

		// Set as active protocol
		dispatch(activeProtocolActions.setActiveProtocol(protocol));

		// Navigate to the protocol
		navigate(`/protocol/${protocolId}`);

		dispatch(toastActions.removeToast(importUUID));

		return protocolId;
	} catch (error) {
		dispatch(toastActions.removeToast(importUUID));

		if (error instanceof CancellationError) {
			console.info("User cancelled the protocol import");
			return null;
		}

		if (axios.isCancel(error)) {
			console.info("User cancelled the protocol import");
			return null;
		}

		await dispatch(importErrorDialog(error));
		throw error;
	}
};

export const actionLocks = {
	loading: loadingLock,
	protocols: protocolsLock,
	saving: savingLock,
};

// Print/view protocol summary (web implementation)
const printOverview = () => async (dispatch: AppDispatch, getState: () => RootState) => {
	// For web, this could open the protocol summary in a new tab/window
	// For now, just log - this will be implemented in Phase 2
	console.log("Print overview - web implementation pending");

	// TODO: Navigate to protocol summary route when implemented in Phase 2
	// const state = getState();
	// const protocolId = getCurrentProtocolId(state);
	// if (protocolId) {
	//   navigate(`/protocol/${protocolId}/summary`);
	// }
};

export const actionCreators = {
	openNetcanvas,
	createNetcanvas,
	saveNetcanvas,
	exportNetcanvas,
	importSampleProtocol,
	printOverview,
};
