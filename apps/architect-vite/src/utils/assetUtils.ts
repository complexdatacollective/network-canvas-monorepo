import type { Protocol } from "@codaco/protocol-validation";
import type JSZip from "jszip";
import { db, type Asset } from "./assetDB";

export const saveAssetToDb = async (
	assetId: string,
	name: string,
	source: string,
	type: string,
	protocolId: string,
	data: ArrayBuffer,
): Promise<void> => {
	const blob = new Blob([data]);

	const asset: Asset = {
		id: assetId,
		name,
		source,
		type,
		protocolId,
		blob,
	};

	await db.assets.put(asset);
};

export const extractProtocolAssets = async (protocol: Protocol, zip: JSZip, protocolId: string): Promise<void> => {
	// Extract and store assets using assetManifest
	const assetManifest = protocol.assetManifest || {};
	const assetKeys = Object.keys(assetManifest);

	console.log(`Found ${assetKeys.length} assets in manifest to extract`);

	// Process assets in parallel using manifest
	const assetPromises = assetKeys.map(async (assetKey) => {
		const asset = assetManifest[assetKey];
		if (!asset) return;

		// Skip apikey assets as they're not actual files
		if (asset.type === "apikey") {
			console.log(`Skipping apikey asset: ${asset.name}`);
			return;
		}

		// Use asset.source for the actual file path in zip
		const assetFile = zip.file(`assets/${asset.source}`);
		if (!assetFile) {
			console.error(`Asset "${asset.source}" not found in zip for manifest entry "${assetKey}"`);
			return;
		}

		const assetData = await assetFile.async("arraybuffer");

		await saveAssetToDb(
			asset.id || assetKey, // Use manifest asset ID, fallback to key
			asset.name, // Original filename from manifest
			asset.source, // Internal filename in zip
			asset.type, // Asset type from manifest
			protocolId,
			assetData,
		);
		console.log(`Saved asset: ${asset.name} (${asset.source}) - ${assetData.byteLength} bytes`);
	});

	await Promise.all(assetPromises);
	console.log("All assets extracted and saved to IndexedDB");
};

export const getAssetById = async (assetId: string): Promise<Asset | undefined> => {
	return await db.assets.get(assetId);
};

export const createBlobUrl = (asset: Asset): string => {
	return URL.createObjectURL(asset.blob);
};

export const revokeBlobUrl = (url: string): void => {
	URL.revokeObjectURL(url);
};

export const getAssetBlobUrl = async (assetId: string): Promise<string | null> => {
	const asset = await getAssetById(assetId);
	if (!asset) {
		return null;
	}
	return createBlobUrl(asset);
};
