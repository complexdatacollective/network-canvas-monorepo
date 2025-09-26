import type { Protocol } from "@codaco/protocol-validation";
import JSZip from "jszip";
import { assetDb } from "./assetDB";

async function getAllProtocolAssets(protocol: Protocol) {
	const assets: Array<{ id: string; source: string; data: Blob | string }> = [];

	if (!protocol.assetManifest) {
		return assets;
	}

	for (const [assetId, assetDefinition] of Object.entries(protocol.assetManifest)) {
		try {
			const assetData = await assetDb.assets.get(assetId);

			if (!assetData) {
				console.warn(`Asset ${assetId} not found in IndexedDB`);
				continue;
			}

			if (typeof assetData.data === "string") {
				console.log(`Skipping string asset: ${assetId}`);
				continue;
			}

			assets.push({
				id: assetId,
				source: assetDefinition.source,
				data: assetData.data,
			});
		} catch (error) {
			console.error(`Error retrieving asset ${assetId}:`, error);
		}
	}

	return assets;
}

export async function bundleProtocol(protocol: Protocol): Promise<Blob> {
	const zip = new JSZip();

	// Remove app state props
	const { name, isValid, ...cleanProtocol } = protocol as any;
	const protocolJson = JSON.stringify(cleanProtocol, null, 2);
	zip.file("protocol.json", protocolJson);

	if (protocol.assetManifest) {
		const assets = await getAllProtocolAssets(protocol);

		const assetsFolder = zip.folder("assets");
		if (assetsFolder) {
			for (const asset of assets) {
				console.log(`Adding asset to bundle: ${asset.source}`);
				assetsFolder.file(asset.source, asset.data);
			}
		}

		console.log(`Bundled ${assets.length} assets with protocol`);
	}

	const blob = await zip.generateAsync({
		type: "blob",
		compression: "DEFLATE",
	});

	return blob;
}

export async function downloadProtocolAsNetcanvas(protocol: Protocol, filename?: string): Promise<void> {
	try {
		const blob = await bundleProtocol(protocol);

		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename || `${protocol.name}.netcanvas`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);

		console.log(`Downloaded protocol: ${a.download}`);
	} catch (error) {
		console.error("Error downloading protocol:", error);
		throw new Error(`Failed to download protocol: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}
