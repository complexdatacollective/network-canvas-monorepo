import devProtocol from "../../../../packages/development-protocol/protocol.json";

const defaultOpenDialogOptions = {
	buttonLabel: "Open",
	nameFieldLabel: "Open:",
	defaultPath: "Protocol.netcanvas",
	filters: [{ name: "Network Canvas", extensions: ["netcanvas"] }],
	properties: ["openFile"],
};

const defaultSaveDialogOptions = {
	buttonLabel: "Save",
	nameFieldLabel: "Save:",
	filters: [{ name: "Network Canvas", extensions: ["netcanvas"] }],
	properties: ["saveFile"],
};

const defaultSaveCopyDialogOptions = {
	buttonLabel: "Save Copy",
	nameFieldLabel: "Save:",
	filters: [{ name: "Network Canvas", extensions: ["netcanvas"] }],
	properties: ["saveFile"],
};

const createDialogOptions = {
	buttonLabel: "Create",
	nameFieldLabel: "Create as:",
	defaultPath: "Protocol.netcanvas",
	filters: [{ name: "Protocols", extensions: ["netcanvas"] }],
};

/**
 * Shows a open dialog and resolves to (cancelled, filepath), which mirrors later
 * versions of electron.
 */
const openDialog = (openDialogOptions = {}) => {
	const _options = {
		...defaultOpenDialogOptions,
		...openDialogOptions,
	};

	// return remote.dialog.showOpenDialog(remote.getCurrentWindow(), options);
	return new Promise((resolve) => {
		resolve({
			cancelled: false,
			protocol: devProtocol,
		});
	});
};

/**
 * Shows a save dialog and resolves to (canceled, filepath), which mirrors later
 * versions of electron.
 */
const saveDialog = (saveDialogOptions = {}) => {
	const _options = {
		...defaultSaveDialogOptions,
		...saveDialogOptions,
	};

	return new Promise((resolve) => {
		resolve({
			cancelled: false,
		});
	});

	// return remote.dialog.showSaveDialog(remote.getCurrentWindow(), options);
};

const saveCopyDialog = (saveCopyOptions = {}) => {
	const options = { ...defaultSaveCopyDialogOptions, ...saveCopyOptions };
	return saveDialog(options);
};

export { createDialogOptions, openDialog, saveCopyDialog, saveDialog };
