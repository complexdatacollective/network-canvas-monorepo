// Desktop implementation. Delegates to `window.modernInterviewerNative`,
// the API installed by `electron/preload.ts` via `contextBridge`. If the
// preload script is not installed (e.g. dev fallback) we silently fall
// back to the web implementation.

import type { PickedFile, Platform } from "./index";
import { webPlatform } from "./web";

async function pickProtocolFile(): Promise<PickedFile | null> {
	const native = window.modernInterviewerNative;
	if (!native) return webPlatform.pickProtocolFile();
	return native.pickProtocolFile();
}

async function saveExport(suggestedName: string, data: Uint8Array) {
	const native = window.modernInterviewerNative;
	if (!native) return webPlatform.saveExport(suggestedName, data);
	return native.saveExport(suggestedName, data);
}

export const desktopPlatform: Platform = {
	kind: "desktop",
	pickProtocolFile,
	saveExport,
};
