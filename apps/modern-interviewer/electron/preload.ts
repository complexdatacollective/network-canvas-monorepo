// Preload script. Exposes a tiny, vetted API surface to the renderer
// over contextBridge — the renderer cannot access Node, only this
// function bag.

import { contextBridge, ipcRenderer } from "electron";

type Meta = { platform: "darwin" | "win32" | "linux"; appVersion: string };

let cachedMeta: Meta = { platform: process.platform as Meta["platform"], appVersion: "0.0.0" };

void ipcRenderer
	.invoke("getMeta")
	.then((meta) => {
		cachedMeta = meta as Meta;
	})
	.catch(() => {
		// Best-effort; the renderer still works.
	});

const api = {
	get platform() {
		return cachedMeta.platform;
	},
	get appVersion() {
		return cachedMeta.appVersion;
	},
	pickProtocolFile: () => ipcRenderer.invoke("pickProtocolFile") as Promise<{ name: string; data: Uint8Array } | null>,
	saveExport: (suggestedName: string, data: Uint8Array) =>
		ipcRenderer.invoke("saveExport", suggestedName, data) as Promise<{ ok: boolean; path?: string }>,
};

contextBridge.exposeInMainWorld("modernInterviewerNative", api);
