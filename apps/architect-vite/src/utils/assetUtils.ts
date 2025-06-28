import { assetDb, type Asset } from "./assetDB";

export const saveAssetToDb = async (asset: Asset): Promise<void> => {
	await assetDb.assets.put(asset);
};

export const saveProtocolAssets = async (assets: Asset[]): Promise<void> => {
	// Process assets in parallel using manifest
	const assetPromises = assets.map(async (asset) => {
		// Skip apikey assets as they're not actual files
		if (typeof asset.data === "string") {
			console.log(`Skipping apikey asset: ${asset.name}`);
			return;
		}

		await saveAssetToDb(asset);
		console.log(`Saved asset: ${asset.name} - ${asset.data.bytes()} bytes`);
	});

	await Promise.all(assetPromises);
	console.log("All assets extracted and saved to IndexedDB");
};

export const getAssetById = async (assetId: string): Promise<Asset | undefined> => {
	return await assetDb.assets.get(assetId);
};

export const createBlobUrl = (asset: Asset): string => {
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
