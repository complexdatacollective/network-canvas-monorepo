import Dexie, { type EntityTable } from "dexie";

interface Asset {
	id: string; // The asset ID from protocol manifest (key)
	name: string; // Original filename from manifest
	source: string; // Internal filename used in zip (asset.source)
	type: string; // Asset type from manifest (image, video, etc.)
	protocolId: string; // Protocol this asset belongs to
	blob: Blob; // The actual file data
}

const db = new Dexie("Architect") as Dexie & {
	assets: EntityTable<
		Asset,
		"id" // primary key "id" (for the typings only)
	>;
};

// Schema declaration:
db.version(1).stores({
	assets: "++id, name, source, type, protocolId, blob", // primary key "id" (for the runtime!)
});

export { db };
export type { Asset };
