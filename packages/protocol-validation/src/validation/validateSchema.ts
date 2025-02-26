import type { DefinedError, ValidateFunction } from "ajv";
import validator1 from "../../dist/schemas/1.js";
import validator2 from "../../dist/schemas/2.js";
import validator3 from "../../dist/schemas/3.js";
import validator4 from "../../dist/schemas/4.js";
import validator5 from "../../dist/schemas/5.js";
import validator6 from "../../dist/schemas/6.js";
import validator7 from "../../dist/schemas/7.js";
import validator8 from "../../dist/schemas/8.js";
import type { Protocol } from "../schemas/8.zod";

const validators: Record<number, ValidateFunction> = {
	1: validator1 as ValidateFunction,
	2: validator2 as ValidateFunction,
	3: validator3 as ValidateFunction,
	4: validator4 as ValidateFunction,
	5: validator5 as ValidateFunction,
	6: validator6 as ValidateFunction,
	7: validator7 as ValidateFunction,
	8: validator8 as ValidateFunction,
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

	const validator = validators[version];

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
