/* eslint-disable no-console */
import type { Protocol } from "@codaco/shared-consts";
import type { DefinedError, ValidateFunction } from "ajv";
import { resolve } from "node:path";

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

	let validator: ValidateFunction;

	try {
		const schemaPath = resolve(__dirname, `../../dist/schemas/${version}.js`);

		const result = (await import(schemaPath)) as {
			default: ValidateFunction;
		};

		validator = result.default;
	} catch (_e) {
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
