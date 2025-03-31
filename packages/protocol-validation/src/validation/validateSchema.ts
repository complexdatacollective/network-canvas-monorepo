import type { DefinedError, ValidateFunction } from "ajv";
import type { Protocol } from "src/schemas/8.zod";

const warning = (message: string) => `\u001B[33m⚠️ ${message}\u001B[39m`;
const info = (message: string) => `\u001B[34mℹ️ ${message}\u001B[39m`;

export const validateSchema = async (protocol: Protocol, forceVersion?: number) => {
	if (!protocol) {
		throw new Error("Protocol is undefined");
	}

	const version = (forceVersion ?? protocol.schemaVersion) || null;

	if (!version) {
		throw new Error("Protocol does not have a schema version, and force version was not used.");
	}

	if (forceVersion) {
		warning(`⚠️ Forcing validation against schema version ${version}.`);
	} else {
		info(`Validating against schema version ${version}.`);
	}

	const validator = await import(`../schemas/compiled/${version}.js`).then(
		(module) => module.default as ValidateFunction,
	);

	if (!validator) {
		throw new Error(`Couldn't find validator for schema version ${version}.`);
	}

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
