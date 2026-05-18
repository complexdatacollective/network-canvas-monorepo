import type { CurrentProtocol } from "@codaco/protocol-validation";
import type { ProtocolWithCounts, StoredAsset, StoredProtocol } from "./types";

function ipc() {
	const api = window.electronAPI;
	if (!api?.db) {
		throw new Error("Electron DB IPC bridge not available");
	}
	return api.db;
}

export async function listProtocols(): Promise<ProtocolWithCounts[]> {
	return ipc().protocols.list();
}

export async function getProtocolByHash(hash: string): Promise<StoredProtocol | undefined> {
	return ipc().protocols.getByHash(hash);
}

export async function getProtocolsByHashes(hashes: readonly string[]): Promise<StoredProtocol[]> {
	return ipc().protocols.getByHashes([...hashes]);
}

export async function getProtocolById(id: string): Promise<StoredProtocol | undefined> {
	return ipc().protocols.getById(id);
}

export async function saveProtocol(
	protocol: CurrentProtocol,
	hash: string,
	assets: { id: string; name: string; data: Blob | string }[],
): Promise<StoredProtocol> {
	const serialisedAssets = await Promise.all(
		assets.map(async (asset) => {
			if (typeof asset.data === "string") {
				return { ...asset, kind: "string" as const, data: asset.data };
			}
			const buffer = await asset.data.arrayBuffer();
			return {
				id: asset.id,
				name: asset.name,
				kind: "blob" as const,
				mimeType: asset.data.type,
				data: new Uint8Array(buffer),
			};
		}),
	);
	return ipc().protocols.save({ protocol, hash, assets: serialisedAssets });
}

export async function deleteProtocol(hash: string): Promise<void> {
	return ipc().protocols.delete(hash);
}

export async function getProtocolAssets(hash: string): Promise<StoredAsset[]> {
	const raw = await ipc().protocols.listAssets(hash);
	return raw.map(deserialiseAsset);
}

export async function getProtocolAsset(hash: string, assetId: string): Promise<StoredAsset | undefined> {
	const raw = await ipc().protocols.getAsset({ hash, assetId });
	return raw ? deserialiseAsset(raw) : undefined;
}

type WireAsset = {
	id: string;
	protocolHash: string;
	assetId: string;
	name: string;
	type: StoredAsset["type"];
	kind: "string" | "blob";
	mimeType?: string;
	data: string | Uint8Array;
};

function deserialiseAsset(raw: WireAsset): StoredAsset {
	if (raw.kind === "string") {
		return {
			id: raw.id,
			protocolHash: raw.protocolHash,
			assetId: raw.assetId,
			name: raw.name,
			type: raw.type,
			data: typeof raw.data === "string" ? raw.data : new TextDecoder().decode(raw.data),
		};
	}
	const arrayBuffer =
		raw.data instanceof Uint8Array
			? raw.data.buffer.slice(raw.data.byteOffset, raw.data.byteOffset + raw.data.byteLength)
			: new ArrayBuffer(0);
	const data = new Blob([arrayBuffer as ArrayBuffer], { type: raw.mimeType });
	return {
		id: raw.id,
		protocolHash: raw.protocolHash,
		assetId: raw.assetId,
		name: raw.name,
		type: raw.type,
		data,
	};
}
