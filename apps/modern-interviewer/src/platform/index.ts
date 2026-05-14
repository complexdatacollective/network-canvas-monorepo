// Platform abstraction.
//
// The app must work on three runtimes that have very different
// capabilities for file I/O. Rather than littering the call-sites with
// `if (PLATFORM === "tablet")` branches, we route all I/O through the
// `Platform` interface and pick an implementation at module load time.

import { PLATFORM } from "../env";
import { desktopPlatform } from "./desktop";
import { tabletPlatform } from "./tablet";
import { webPlatform } from "./web";

export type PickedFile = {
	name: string;
	data: Uint8Array;
};

export type Platform = {
	readonly kind: "web" | "desktop" | "tablet";
	/** Open the system file picker for `.netcanvas` files. */
	pickProtocolFile: () => Promise<PickedFile | null>;
	/**
	 * Save a binary blob to the user's preferred location. Returns the
	 * absolute path if known, or undefined for web (where the browser
	 * controls the destination).
	 */
	saveExport: (suggestedName: string, data: Uint8Array) => Promise<{ ok: boolean; path?: string }>;
};

function resolvePlatform(): Platform {
	if (PLATFORM === "desktop") return desktopPlatform;
	if (PLATFORM === "tablet") return tabletPlatform;
	return webPlatform;
}

export const platform: Platform = resolvePlatform();
