import type Zip from "jszip";
import JSZip from "jszip";
import type { Protocol } from "src/schemas/8.zod";

const getProtocolJsonAsObject = async (zip: Zip): Promise<Protocol> => {
	const protocolString = await zip.file("protocol.json")?.async("string");

	if (!protocolString) {
		throw new Error("protocol.json not found in zip");
	}

	return JSON.parse(protocolString);
};

export type ExtractedAsset = {
	id: string; // The asset ID from protocol manifest (key)
	name: string; // Original filename from manifest
	data: Blob | string; // The actual file data
};

const extractProtocolAssets = async (protocol: Protocol, zip: Zip) => {
	const assetPromises = Object.entries(protocol.assetManifest || {}).map(async ([assetId, assetDefinition]) => {
		if (assetDefinition.type === "apikey") {
			// Value is a string, not a file
			return { id: assetId, name: assetDefinition.name, data: assetDefinition.value };
		}

		const fileData = await zip.file(`assets/${assetDefinition.source}`)?.async("blob");
		if (!fileData) {
			throw new Error(`Asset file "${assetDefinition.source}" not found in zip for asset ID "${assetId}"`);
		}

		return { id: assetId, name: assetDefinition.name, data: fileData };
	});

	return Promise.all(assetPromises);
};

export const extractProtocol = async (
	protocolBuffer: ArrayBuffer,
): Promise<{ protocol: Protocol; assets: Array<ExtractedAsset> }> => {
	const zip = await JSZip.loadAsync(protocolBuffer);
	const protocol = await getProtocolJsonAsObject(zip);
	const assets = await extractProtocolAssets(protocol, zip);

	return {
		assets,
		protocol,
	};
};
