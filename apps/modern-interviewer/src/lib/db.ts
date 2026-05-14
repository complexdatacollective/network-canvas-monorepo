// Single-file Dexie database for the modern interviewer.
//
// We use one Dexie instance per app and rely on IndexedDB on every target.
// Even on desktop / tablet, IndexedDB is the path of least resistance — it
// works identically inside Electron's renderer and inside Capacitor's
// WebView (where it persists into the app's container).

import type { Codebook } from "@codaco/protocol-validation";
import type { NcNetwork } from "@codaco/shared-consts";
import Dexie, { type Table } from "dexie";

export type ProtocolRecord = {
	id: string;
	hash: string;
	name: string;
	description?: string;
	schemaVersion: number;
	importedAt: string;
	lastUsedAt?: string;
	codebook: Codebook;
	// `stages` is unknown at the database layer — schemas live in the
	// protocol-validation package and we re-hydrate them on use.
	stages: unknown;
	experiments?: unknown;
	// Everything else from the protocol payload (e.g. `lastModified`) is
	// preserved in `raw` so we can round-trip it back out to the interview
	// engine without lossy re-serialisation.
	raw: Record<string, unknown>;
	assetIds: string[];
};

export type AssetRecord = {
	assetId: string;
	protocolId: string;
	name: string;
	type: "image" | "video" | "audio" | "network" | "geojson" | "apikey";
	blob?: Blob;
	value?: string;
};

export type InterviewRecord = {
	id: string;
	protocolId: string;
	protocolHash: string;
	participantIdentifier: string;
	startTime: string;
	lastUpdated: string;
	finishTime: string | null;
	exportTime: string | null;
	currentStep: number;
	network: NcNetwork;
	stageMetadata?: Record<string, unknown>;
	stageRequiresEncryption?: boolean;
};

/** @public */
export class ModernInterviewerDB extends Dexie {
	protocols!: Table<ProtocolRecord, string>;
	assets!: Table<AssetRecord, string>;
	interviews!: Table<InterviewRecord, string>;

	constructor() {
		super("modern-interviewer");
		this.version(1).stores({
			protocols: "id, hash, name, importedAt, lastUsedAt",
			assets: "assetId, protocolId, type",
			interviews: "id, protocolId, protocolHash, startTime, lastUpdated, finishTime, exportTime",
		});
	}
}

export const db = new ModernInterviewerDB();
