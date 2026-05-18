import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { migrateLegacyDbFilename } from "./db/service";
import { registerAuthHandlers } from "./handlers/authHandlers";
import { registerDbHandlers } from "./handlers/dbHandlers";

const isDev = !app.isPackaged;
const RENDERER_DEV_URL = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:5181";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 900,
		minHeight: 600,
		title: "Network Canvas Interviewer v7",
		backgroundColor: "#1c1c1c",
		webPreferences: {
			preload: join(__dirname, "../preload/index.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			additionalArguments: app.isPackaged ? ["--isPackaged"] : [],
		},
	});

	if (isDev) {
		void mainWindow.loadURL(RENDERER_DEV_URL);
		mainWindow.webContents.openDevTools({ mode: "detach" });
	} else {
		void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});
}

app.whenReady().then(() => {
	try {
		migrateLegacyDbFilename();
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		dialog.showErrorBox("Cannot start Network Canvas Interviewer v7", message);
		app.exit(1);
		return;
	}
	registerDbHandlers();
	registerAuthHandlers();
	createWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("dialog:openProtocol", async () => {
	if (!mainWindow) return null;
	const result = await dialog.showOpenDialog(mainWindow, {
		title: "Open protocol",
		filters: [{ name: "Network Canvas Protocol", extensions: ["netcanvas", "zip"] }],
		properties: ["openFile"],
	});
	if (result.canceled || result.filePaths.length === 0) {
		return { canceled: true };
	}
	const path = result.filePaths[0];
	if (!path) return { canceled: true };
	const data = await readFile(path);
	return {
		canceled: false,
		name: basename(path),
		data: new Uint8Array(data),
	};
});

ipcMain.handle("dialog:saveFile", async (_event, suggestedName: string, payload: Uint8Array) => {
	if (!mainWindow) return { canceled: true };
	const result = await dialog.showSaveDialog(mainWindow, {
		title: "Save export",
		defaultPath: suggestedName,
		filters: [{ name: "Zip archive", extensions: ["zip"] }],
	});
	if (result.canceled || !result.filePath) {
		return { canceled: true };
	}
	await writeFile(result.filePath, Buffer.from(payload));
	return { canceled: false, path: result.filePath };
});

ipcMain.handle("system:platform", () => process.platform);
