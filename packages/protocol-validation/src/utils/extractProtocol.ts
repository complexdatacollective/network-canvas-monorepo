import type Zip from "jszip";
import JSZip from "jszip";
import type { Protocol } from "src/schemas/8/schema";

const getProtocolJsonAsObject = async (zip: Zip): Promise<Protocol> => {
	const protocolString = await zip.file("protocol.json")?.async("string");

	if (!protocolString) {
		throw new Error("protocol.json not found in zip");
	}

	return JSON.parse(protocolString);
};

export const extractProtocol = async (protocolBuffer: Buffer): Promise<Protocol> => {
	const zip = await JSZip.loadAsync(protocolBuffer);
	return await getProtocolJsonAsObject(zip);
};
