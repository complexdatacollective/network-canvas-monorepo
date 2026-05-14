import type { ResolvedAsset } from "@codaco/interview";
import { type AssetRecord, db } from "../lib/db";

// Maps a protocol's persisted AssetRecord into the ResolvedAsset shape
// expected by `@codaco/interview`. File-based assets are referenced by
// ID; the Shell will call `onRequestAsset` to receive a URL on demand.
export function toResolvedAsset(record: AssetRecord): ResolvedAsset {
	if (record.type === "apikey") {
		return {
			assetId: record.assetId,
			name: record.name,
			type: "apikey",
			value: record.value,
		};
	}
	return {
		assetId: record.assetId,
		name: record.name,
		type: record.type,
	};
}

/**
 * Maintains a cache of object URLs created for asset blobs in this
 * interview session. The caller is responsible for revoking when the
 * interview unmounts.
 */
export class AssetUrlCache {
	private urls = new Map<string, string>();

	async resolve(assetId: string): Promise<string> {
		const cached = this.urls.get(assetId);
		if (cached) return cached;
		const record = await db.assets.get(assetId);
		if (!record) throw new Error(`Asset ${assetId} not found`);
		if (record.type === "apikey") {
			throw new Error(`Asset ${assetId} is an apikey; access via .value, not URL`);
		}
		if (!record.blob) {
			throw new Error(`Asset ${assetId} has no blob`);
		}
		const url = URL.createObjectURL(record.blob);
		this.urls.set(assetId, url);
		return url;
	}

	dispose() {
		for (const url of this.urls.values()) URL.revokeObjectURL(url);
		this.urls.clear();
	}
}
