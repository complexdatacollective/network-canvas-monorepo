import type Zip from "jszip";
import type { Protocol } from "../schemas/src/8.zod";

export const getProtocolJson = async (protocolZip: Zip) => {
	const protocolString = await protocolZip?.file("protocol.json")?.async("string");

	if (!protocolString) {
		throw new Error("protocol.json not found in zip");
	}

	const protocolJson = (await JSON.parse(protocolString)) as Protocol;

	return protocolJson;
};
