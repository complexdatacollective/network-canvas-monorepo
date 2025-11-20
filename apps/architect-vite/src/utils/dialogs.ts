import devProtocol from "../../../../packages/development-protocol/protocol.json";

// Browser-only stub implementations - electron functionality removed
// These functions need reimplementation for web-based file handling

type DialogFilter = {
	name: string;
	extensions: string[];
};

type DialogOptions = {
	buttonLabel?: string;
	nameFieldLabel?: string;
	defaultPath?: string;
	filters?: DialogFilter[];
	properties?: string[];
};

type OpenDialogResult = {
	cancelled: boolean;
	protocol?: typeof devProtocol;
	filePaths?: string[];
};

type SaveDialogResult = {
	cancelled: boolean;
	filePath?: string;
};

const defaultOpenDialogOptions: DialogOptions = {
	buttonLabel: "Open",
	nameFieldLabel: "Open:",
	defaultPath: "Protocol.netcanvas",
	filters: [{ name: "Network Canvas", extensions: ["netcanvas"] }],
	properties: ["openFile"],
};

const defaultSaveDialogOptions: DialogOptions = {
	buttonLabel: "Save",
	nameFieldLabel: "Save:",
	filters: [{ name: "Network Canvas", extensions: ["netcanvas"] }],
	properties: ["saveFile"],
};

const defaultSaveCopyDialogOptions: DialogOptions = {
	buttonLabel: "Save Copy",
	nameFieldLabel: "Save:",
	filters: [{ name: "Network Canvas", extensions: ["netcanvas"] }],
	properties: ["saveFile"],
};

const createDialogOptions: DialogOptions = {
	buttonLabel: "Create",
	nameFieldLabel: "Create as:",
	defaultPath: "Protocol.netcanvas",
	filters: [{ name: "Protocols", extensions: ["netcanvas"] }],
};

/**
 * Browser stub for open dialog - needs reimplementation for web
 * TODO: Implement using File System Access API or file input
 */
const openDialog = (openDialogOptions: DialogOptions = {}): Promise<OpenDialogResult> => {
	const _options = {
		...defaultOpenDialogOptions,
		...openDialogOptions,
	};

	console.log("openDialog stub called - needs web implementation", _options);

	// Development mode: return dev protocol
	return Promise.resolve({
		cancelled: false,
		protocol: devProtocol,
	});
};

/**
 * Browser stub for save dialog - needs reimplementation for web
 * TODO: Implement using File System Access API or download trigger
 */
const saveDialog = (saveDialogOptions: DialogOptions = {}): Promise<SaveDialogResult> => {
	const _options = {
		...defaultSaveDialogOptions,
		...saveDialogOptions,
	};

	console.log("saveDialog stub called - needs web implementation", _options);

	return Promise.resolve({
		cancelled: false,
	});
};

const saveCopyDialog = (saveCopyOptions: DialogOptions = {}): Promise<SaveDialogResult> => {
	const options = { ...defaultSaveCopyDialogOptions, ...saveCopyOptions };
	return saveDialog(options);
};

export { createDialogOptions, openDialog, saveCopyDialog, saveDialog };
export type { DialogFilter, DialogOptions, OpenDialogResult, SaveDialogResult };
