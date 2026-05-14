import {
	type ExtractedAsset,
	extractProtocol,
	hashProtocol,
	migrateProtocol,
	validateProtocol,
} from "@codaco/protocol-validation";
import { v4 as uuid } from "uuid";
import { type AssetRecord, db, type ProtocolRecord } from "../lib/db";

/** @public */
export type ImportResult = { ok: true; protocol: ProtocolRecord } | { ok: false; reason: string; details?: unknown };

type AnyAssetDefinition = {
	type: "image" | "video" | "audio" | "network" | "geojson" | "apikey";
	name: string;
	source?: string;
	value?: string;
};

function pickType(definition: AnyAssetDefinition): AssetRecord["type"] {
	return definition.type;
}

export async function importProtocolFromBytes(bytes: Uint8Array, fileName?: string): Promise<ImportResult> {
	let extracted: { protocol: unknown; assets: ExtractedAsset[] };
	try {
		// `extractProtocol` is typed to accept a Node Buffer but its
		// JSZip-based implementation handles Uint8Array transparently.
		extracted = (await extractProtocol(bytes as unknown as Parameters<typeof extractProtocol>[0])) as typeof extracted;
	} catch (err) {
		return { ok: false, reason: "Could not read .netcanvas file", details: errorToString(err) };
	}

	let migrated: Awaited<ReturnType<typeof migrateProtocol>>;
	try {
		migrated = await migrateProtocol(extracted.protocol as Parameters<typeof migrateProtocol>[0]);
	} catch (err) {
		return { ok: false, reason: "Protocol migration failed", details: errorToString(err) };
	}

	const validation = await validateProtocol(migrated);
	if (!validation.success) {
		return {
			ok: false,
			reason: "Protocol failed schema validation",
			details: validation.error?.issues ?? validation.error,
		};
	}

	const protocol = validation.data;
	const hash = hashProtocol(protocol);
	const existing = await db.protocols.where("hash").equals(hash).first();
	if (existing) {
		// Idempotent import: refresh `lastUsedAt` and reuse the existing record.
		await db.protocols.update(existing.id, { lastUsedAt: new Date().toISOString() });
		return { ok: true, protocol: { ...existing, lastUsedAt: new Date().toISOString() } };
	}

	const protocolId = uuid();
	const importedAt = new Date().toISOString();
	const assetIds: string[] = [];

	const manifest = (protocol.assetManifest ?? {}) as Record<string, AnyAssetDefinition>;
	const assetRecords: AssetRecord[] = extracted.assets.map((asset) => {
		const definition = manifest[asset.id] ?? ({} as AnyAssetDefinition);
		const type = pickType(definition);
		assetIds.push(asset.id);
		if (type === "apikey") {
			return {
				assetId: asset.id,
				protocolId,
				name: asset.name,
				type,
				value: typeof asset.data === "string" ? asset.data : undefined,
			};
		}
		return {
			assetId: asset.id,
			protocolId,
			name: asset.name,
			type,
			blob: asset.data instanceof Blob ? asset.data : undefined,
		};
	});

	const schemaVersion = Number((protocol as { schemaVersion?: number | string }).schemaVersion ?? 8);

	const record: ProtocolRecord = {
		id: protocolId,
		hash,
		name: (protocol as { name?: string }).name ?? fileName ?? "Untitled protocol",
		description: (protocol as { description?: string }).description,
		schemaVersion: Number.isFinite(schemaVersion) ? schemaVersion : 8,
		importedAt,
		lastUsedAt: importedAt,
		codebook: protocol.codebook,
		stages: protocol.stages,
		experiments: (protocol as { experiments?: unknown }).experiments,
		raw: protocol as unknown as Record<string, unknown>,
		assetIds,
	};

	await db.transaction("rw", db.protocols, db.assets, async () => {
		await db.protocols.put(record);
		if (assetRecords.length > 0) {
			await db.assets.bulkPut(assetRecords);
		}
	});

	return { ok: true, protocol: record };
}

function errorToString(err: unknown): string {
	if (err instanceof Error) return err.message;
	try {
		return JSON.stringify(err);
	} catch {
		return String(err);
	}
}
