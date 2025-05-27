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
	const options = {
		...defaultOpenDialogOptions,
		...openDialogOptions,
	};

	// return remote.dialog.showOpenDialog(remote.getCurrentWindow(), options);
	return new Promise((resolve) => {
		const result = window.prompt("This is an open dialog");

		resolve({
			cancelled: !!result,
			protocol: devProtocol,
		});
	});
};

/**
 * Shows a save dialog and resolves to (canceled, filepath), which mirrors later
 * versions of electron.
 */
const saveDialog = (saveDialogOptions = {}) => {
	const options = {
		...defaultSaveDialogOptions,
		...saveDialogOptions,
	};

	return new Promise((resolve) => {
		const result = window.prompt("This is a save dialog");

		resolve({
			cancelled: !!result,
		});
	});

	// return remote.dialog.showSaveDialog(remote.getCurrentWindow(), options);
};

const saveCopyDialog = (saveCopyOptions = {}) => {
	const options = { ...defaultSaveCopyDialogOptions, ...saveCopyOptions };
	return saveDialog(options);
};

export { createDialogOptions, openDialog, saveCopyDialog, saveDialog };
