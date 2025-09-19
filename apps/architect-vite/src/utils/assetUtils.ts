import type { ExtractedAsset } from "@codaco/protocol-validation/dist/src/utils/extractProtocol";
import { assetDb } from "./assetDB";

export const saveAssetToDb = async (asset: ExtractedAsset): Promise<void> => {
	await assetDb.assets.put(asset);
};

export const saveProtocolAssets = async (assets: ExtractedAsset[]): Promise<void> => {
	// Process assets in parallel using manifest
	const assetPromises = assets.map(async (asset) => {
		// Skip apikey assets as they're not actual files
		if (typeof asset.data === "string") {
			console.log(`Skipping apikey asset: ${asset.name}`);
			return;
		}

		await saveAssetToDb(asset);
	});

	await Promise.all(assetPromises);
	console.log("All assets extracted and saved to IndexedDB");
};

export const getAssetById = async (assetId: string): Promise<ExtractedAsset | undefined> => {
	return await assetDb.assets.get(assetId);
};

export const createBlobUrl = (asset: ExtractedAsset): string => {
	if (typeof asset.data === "string") {
		console.warn(`Asset ${asset.name} is not a Blob, cannot create Blob URL.`);
		return asset.data; // Return the string directly if it's not a Blob
	}

	return URL.createObjectURL(asset.data);
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
