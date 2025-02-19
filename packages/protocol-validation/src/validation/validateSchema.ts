import type { Protocol } from "../types/protocol";

const loadZodSchema = async (version: number) => {
	try {
		const schema = await import(`../schemas/${version}.zod.ts`);
		return schema.Protocol;
	} catch (error) {
		throw new Error(`Error loading schema version ${version}: ${error}`);
	}
};

export const validateSchema = async (protocol: Protocol, forceVersion?: number) => {
	if (!protocol) {
		throw new Error("Protocol is undefined");
	}

	const version = (forceVersion ?? protocol.schemaVersion) || null;

	if (!version) {
		throw new Error("Protocol does not have a schema version, and force version was not used.");
	}

	if (forceVersion) {
		console.log(`Forcing validation against schema version ${version}...`);
	}

	const schema = await loadZodSchema(version);
	const result = schema.safeParse(protocol);

	if (!result.success) {
		return {
			hasErrors: true,
			errors: [result.error],
		};
	}
	return {
		hasErrors: false,
		errors: [],
	};
};
