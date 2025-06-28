import type { ExtractedAsset } from "@codaco/protocol-validation/dist/src/utils/extractProtocol";
import Dexie, { type EntityTable } from "dexie";

export const assetDb = new Dexie("ArchitectAssetDB") as Dexie & {
	assets: EntityTable<
		ExtractedAsset,
		"id" // primary key "id" (for the typings only)
	>;
};

// Schema declaration:
assetDb.version(1).stores({
	assets: "++id, name, data", // primary key "id" (for the runtime!)
});

/**
 * Clear all stored data (protocols, active protocol, assets, etc.)
 * This function clears Redux state, localStorage, and IndexedDB
 */
export async function clearAllStorage() {
	try {
		// Clear localStorage
		localStorage.clear();

		// Clear assetDB (IndexedDB)
		await assetDb.assets.clear();

		// Reload the page to reset Redux state
		window.location.reload();

		console.log("Storage cleared and app reloaded");
	} catch (error) {
		console.error("Error clearing storage:", error);
	}
}
