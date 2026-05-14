// Electron main process entry for the Modern Interviewer desktop build.
//
// The renderer is the same Vite bundle as the web target. In development
// the main process loads from electron-vite's dev server; in production
// it loads the bundled `dist/index.html` via `file://`.

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain } from "electron";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 1280,
		height: 800,
		minWidth: 960,
		minHeight: 640,
		title: "Network Canvas Interviewer",
		webPreferences: {
			// electron-vite emits the preload as ESM (.mjs) because the package
			// is "type": "module". `sandbox: false` is required for ESM preload
			// scripts in Electron >= 28.
			preload: join(__dirname, "../preload/preload.mjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	const devServerUrl = process.env.ELECTRON_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
	if (devServerUrl) {
		void mainWindow.loadURL(devServerUrl);
	} else {
		void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
	}
}

function registerIpc() {
	ipcMain.handle("pickProtocolFile", async () => {
		const result = await dialog.showOpenDialog({
			title: "Open a .netcanvas protocol",
			properties: ["openFile"],
			filters: [
				{ name: "Network Canvas Protocols", extensions: ["netcanvas"] },
				{ name: "All files", extensions: ["*"] },
			],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		const filePath = result.filePaths[0];
		if (!filePath || !existsSync(filePath)) return null;
		const buffer = await readFile(filePath);
		const name = filePath.split(/[\\/]/).pop() ?? "protocol.netcanvas";
		return { name, data: new Uint8Array(buffer) };
	});

	ipcMain.handle("saveExport", async (_event, suggestedName: string, data: Uint8Array) => {
		const result = await dialog.showSaveDialog({
			title: "Save export",
			defaultPath: suggestedName,
			filters: [{ name: "Zip archive", extensions: ["zip"] }],
		});
		if (result.canceled || !result.filePath) return { ok: false };
		await writeFile(result.filePath, Buffer.from(data));
		return { ok: true, path: result.filePath };
	});

	ipcMain.handle("getMeta", () => ({
		platform: process.platform,
		appVersion: app.getVersion(),
	}));
}

void app.whenReady().then(() => {
	registerIpc();
	createMainWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
