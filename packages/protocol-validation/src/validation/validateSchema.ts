/* eslint-disable no-console */
import type { Protocol } from "@codaco/shared-consts";
import type { DefinedError } from "ajv";
import Ajv from "ajv";

const ajv = new Ajv({
	code: { source: true, esm: true, lines: true },
	allErrors: true,
	allowUnionTypes: true,
});

ajv.addFormat("integer", /\d+/);
ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);

const loadJSONSchema = async (version: number) => {
	try {
		const schema = await import(`../schemas/${version}.json`);
		return schema.default;
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

	const schema = await loadJSONSchema(version);
	const validator = ajv.compile(schema);

	const result = validator(protocol);

	// Validate
	if (!result) {
		const errors = validator.errors as DefinedError[];
		// If we get here, validator has validator.errors.
		const errorMessages = errors.map((error) => {
			return {
				...error,
				path: error.instancePath,
				message: error.message,
			};
		});

		return {
			hasErrors: true,
			errors: errorMessages,
		};
	}

	return {
		hasErrors: false,
		errors: [],
	};
};
