import type { CurrentProtocol } from "@codaco/protocol-validation";
import { db } from "./db";
import type { ProtocolWithCounts, StoredAsset, StoredProtocol } from "./types";

export async function listProtocols(): Promise<ProtocolWithCounts[]> {
	const protocols = await db.protocols.orderBy("importedAt").reverse().toArray();
	const sessions = await db.sessions.toArray();
	const counts = new Map<string, number>();
	for (const s of sessions) {
		counts.set(s.protocolHash, (counts.get(s.protocolHash) ?? 0) + 1);
	}
	return protocols.map((p) => ({ ...p, sessionCount: counts.get(p.hash) ?? 0 }));
}

export async function getProtocolByHash(hash: string): Promise<StoredProtocol | undefined> {
	return db.protocols.where("hash").equals(hash).first();
}

export async function getProtocolsByHashes(hashes: readonly string[]): Promise<StoredProtocol[]> {
	const out: StoredProtocol[] = [];
	for (const hash of new Set(hashes)) {
		const stored = await db.protocols.where("hash").equals(hash).first();
		if (stored) out.push(stored);
	}
	return out;
}

export async function getProtocolById(id: string): Promise<StoredProtocol | undefined> {
	return db.protocols.get(id);
}

export async function saveProtocol(
	protocol: CurrentProtocol,
	hash: string,
	assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
	const existing = await getProtocolByHash(hash);
	const id = existing?.id ?? hash;
	const stored: StoredProtocol = {
		id,
		hash,
		name: protocol.name,
		schemaVersion: protocol.schemaVersion,
		lastModified: protocol.lastModified,
		importedAt: existing?.importedAt ?? new Date().toISOString(),
		description: protocol.description,
		codebook: protocol.codebook,
		protocol,
	};

	await db.transaction("rw", db.protocols, db.assets, async () => {
		await db.protocols.put(stored);
		await db.assets.where("protocolHash").equals(hash).delete();
		const assetRecords: StoredAsset[] = assets.map((asset) => {
			const manifestEntry = protocol.assetManifest?.[asset.id];
			const type = (manifestEntry?.type ?? "image") as StoredAsset["type"];
			return {
				id: `${hash}::${asset.id}`,
				protocolHash: hash,
				assetId: asset.id,
				name: asset.name,
				type,
				data: asset.data,
			};
		});
		if (assetRecords.length > 0) {
			await db.assets.bulkPut(assetRecords);
		}
	});

	return stored;
}

export async function deleteProtocol(hash: string): Promise<void> {
	await db.transaction("rw", db.protocols, db.sessions, db.assets, async () => {
		const protocol = await getProtocolByHash(hash);
		if (!protocol) return;
		await db.protocols.delete(protocol.id);
		await db.assets.where("protocolHash").equals(hash).delete();
		await db.sessions.where("protocolHash").equals(hash).delete();
	});
}

export async function getProtocolAssets(hash: string): Promise<StoredAsset[]> {
	return db.assets.where("protocolHash").equals(hash).toArray();
}

export async function getProtocolAsset(hash: string, assetId: string): Promise<StoredAsset | undefined> {
	return db.assets.get(`${hash}::${assetId}`);
}
