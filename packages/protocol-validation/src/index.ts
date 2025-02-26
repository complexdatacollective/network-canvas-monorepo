import type { DefinedError } from "ajv";
import canUpgrade from "./migrations/canUpgrade";
import getMigrationNotes from "./migrations/getMigrationNotes";
import { migrateProtocol } from "./migrations/migrateProtocol";
import type { MapOptions, Protocol } from "./schemas/8.zod";
import { ensureError } from "./utils/ensureError";
import { getVariableNamesFromNetwork, validateNames } from "./utils/validateExternalData";
import { errToString } from "./validation/helpers";
import { validateLogic } from "./validation/validateLogic";
import { validateSchema } from "./validation/validateSchema";

// helper methods
export {
	canUpgrade,
	errToString,
	getMigrationNotes,
	getVariableNamesFromNetwork,
	migrateProtocol,
	validateLogic,
	validateNames,
	validateSchema,
};

// types
export type { MapOptions, Protocol };

export type ValidationError = Partial<DefinedError> & {
	path: string;
	message: string;
};

type ValidationResult = {
	isValid: boolean;
	schemaErrors: ValidationError[];
	logicErrors: ValidationError[];
	schemaVersion: number;
	schemaForced: boolean;
};

const validateProtocol = async (protocol: Protocol, forceSchemaVersion?: number) => {
	if (protocol === undefined) {
		throw new Error("Protocol is undefined");
	}

	try {
		const { hasErrors: hasSchemaErrors, errors: schemaErrors } = await validateSchema(protocol, forceSchemaVersion);
		const { hasErrors: hasLogicErrors, errors: logicErrors } = validateLogic(protocol);

		return {
			isValid: !hasSchemaErrors && !hasLogicErrors,
			schemaErrors,
			logicErrors,
			schemaVersion: protocol.schemaVersion,
			schemaForced: forceSchemaVersion !== undefined,
		} as ValidationResult;
	} catch (e) {
		const error = ensureError(e);

		throw new Error(`Protocol validation failed due to an internal error: ${error.message}`);
	}
};

export { validateProtocol };
