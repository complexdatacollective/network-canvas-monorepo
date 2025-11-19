import type Zip from "jszip";
import JSZip from "jszip";
import type { VersionedProtocol } from "~/schemas";

const getProtocolJsonAsObject = async (zip: Zip): Promise<VersionedProtocol> => {
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

const extractProtocolAssets = async (protocol: VersionedProtocol, zip: Zip) => {
	const assetPromises = Object.entries(protocol.assetManifest || {}).map(async ([assetId, assetDefinition]) => {
		if (typeof assetDefinition === "object" && assetDefinition !== null && "type" in assetDefinition) {
			if (assetDefinition.type === "apikey") {
				// Value is a string, not a file
				return { id: assetId, name: assetDefinition.name, data: assetDefinition.value };
			}

			const fileData = await zip.file(`assets/${assetDefinition.source}`)?.async("blob");
			if (!fileData) {
				throw new Error(`Asset file "${assetDefinition.source}" not found in zip for asset ID "${assetId}"`);
			}

			return { id: assetId, name: assetDefinition.name, data: fileData };
		}
		throw new Error(`Invalid asset definition for asset ID "${assetId}"`);
	});

	return Promise.all(assetPromises);
};

export const extractProtocol = async (
	protocolBuffer: Buffer,
): Promise<{ protocol: VersionedProtocol; assets: Array<ExtractedAsset> }> => {
	const zip = await JSZip.loadAsync(protocolBuffer);
	const protocol = await getProtocolJsonAsObject(zip);
	const assets = await extractProtocolAssets(protocol, zip);

	return {
		assets,
		protocol,
	};
};
