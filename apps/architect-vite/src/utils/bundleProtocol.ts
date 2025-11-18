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
				continue;
			}

			if (typeof assetData.data === "string") {
				continue;
			}

			assets.push({
				id: assetId,
				source: assetDefinition.source,
				data: assetData.data,
			});
		} catch (_error) {}
	}

	return assets;
}

export async function bundleProtocol(protocol: Protocol): Promise<Blob> {
	const zip = new JSZip();

	// Remove app state props
	const { name, isValid, lastSavedAt, lastSavedTimeline, ...cleanProtocol } = protocol as any;
	const protocolJson = JSON.stringify(cleanProtocol, null, 2);
	zip.file("protocol.json", protocolJson);

	if (protocol.assetManifest) {
		const assets = await getAllProtocolAssets(protocol);

		const assetsFolder = zip.folder("assets");
		if (assetsFolder) {
			for (const asset of assets) {
				assetsFolder.file(asset.source, asset.data);
			}
		}
	}

	const blob = await zip.generateAsync({
		type: "blob",
		compression: "DEFLATE",
	});

	return blob;
}

export async function downloadProtocolAsNetcanvas(protocol: Protocol): Promise<void> {
	try {
		const blob = await bundleProtocol(protocol);

		// build local timestamp YYYY-MM-DD_HH-MM
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const timestamp = `${year}-${month}-${day}_${hours}-${minutes}`;

		const fileName = `${protocol.name.replace(/\s+/g, "_")}-${timestamp}.netcanvas`;

		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	} catch (error) {
		throw new Error(`Failed to download protocol: ${error instanceof Error ? error.message : "Unknown error"}`);
	}
}
