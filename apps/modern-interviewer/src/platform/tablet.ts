// Capacitor implementation. The tablet WebView is sandboxed and cannot
// trigger a download via an <a download> link, so we use the Filesystem
// plugin to write to the app's Documents directory.

import { Directory, Filesystem } from "@capacitor/filesystem";
import type { PickedFile, Platform } from "./index";
import { webPlatform } from "./web";

async function pickProtocolFile(): Promise<PickedFile | null> {
	// The Capacitor Filesystem plugin doesn't provide a system file picker;
	// the easiest cross-platform UX is to use a hidden HTML file input,
	// which works inside the WebView on both iPadOS and Android.
	return webPlatform.pickProtocolFile();
}

function base64FromBytes(bytes: Uint8Array): string {
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		const slice = bytes.subarray(i, i + chunk);
		binary += String.fromCharCode(...slice);
	}
	return btoa(binary);
}

async function saveExport(suggestedName: string, data: Uint8Array) {
	const base64 = base64FromBytes(data);
	const result = await Filesystem.writeFile({
		path: suggestedName,
		data: base64,
		directory: Directory.Documents,
		recursive: true,
	});
	return { ok: true, path: result.uri };
}

export const tabletPlatform: Platform = {
	kind: "tablet",
	pickProtocolFile,
	saveExport,
};
