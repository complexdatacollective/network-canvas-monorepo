import Dexie, { type Table } from "dexie";
import {
	DEFAULT_SETTINGS,
	type StoredAsset,
	type StoredProtocol,
	type StoredSession,
	type StoredSettings,
} from "./types";

class InterviewerV7DB extends Dexie {
	protocols!: Table<StoredProtocol, string>;
	sessions!: Table<StoredSession, string>;
	assets!: Table<StoredAsset, string>;
	settings!: Table<StoredSettings, "device">;

	constructor() {
		super("interviewer-v7");
		this.version(1).stores({
			protocols: "id, hash, name, importedAt",
			sessions: "id, protocolHash, caseId, startedAt, lastUpdatedAt, finishedAt, exportedAt",
			assets: "id, protocolHash, assetId",
			settings: "id",
		});
	}
}

export const db = new InterviewerV7DB();

export async function getSettings(): Promise<StoredSettings> {
	const existing = await db.settings.get("device");
	if (existing) {
		return { ...DEFAULT_SETTINGS, ...existing, id: "device" };
	}
	await db.settings.put(DEFAULT_SETTINGS);
	return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Omit<StoredSettings, "id">>): Promise<StoredSettings> {
	const current = await getSettings();
	const next: StoredSettings = { ...current, ...patch };
	await db.settings.put(next);
	return next;
}
