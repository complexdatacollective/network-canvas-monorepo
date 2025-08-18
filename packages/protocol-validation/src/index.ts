import type { DefinedError } from "ajv";
import canUpgrade from "./migrations/canUpgrade";
import getMigrationNotes from "./migrations/getMigrationNotes";
import { migrateProtocol } from "./migrations/migrateProtocol";
import type { Protocol } from "./schemas/8.zod";
import ProtocolSchema from "./schemas/8.zod";
import { ensureError } from "./utils/ensureError";
import { extractProtocol } from "./utils/extractProtocol";
import { getVariableNamesFromNetwork, validateNames } from "./utils/validateExternalData";
import { errToString } from "./validation/helpers";
import { validateLogic } from "./validation/validateLogic";
import { validateSchema } from "./validation/validateSchema";

// helper methods
export {
	canUpgrade,
	errToString,
	extractProtocol,
	getMigrationNotes,
	getVariableNamesFromNetwork,
	migrateProtocol,
	validateLogic,
	validateNames,
	validateSchema,
};

// Export schema types and constants (Protocol, Codebook, etc)
export * from "./schemas/8.zod";

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

/**
 * Version of validateProtocol that just uses the zod schema.
 */
export const validateProtocolZod = async (protocol: Protocol) => {
	if (protocol === undefined) {
		throw new Error("Protocol is undefined");
	}

	try {
		const result = ProtocolSchema.safeParse(protocol);
		const { hasErrors: hasLogicErrors, errors: logicErrors } = validateLogic(protocol);

		if (result.success && !hasLogicErrors) {
			return {
				isValid: true,
				schemaErrors: [],
				logicErrors,
				schemaVersion: protocol.schemaVersion,
				schemaForced: false,
			} as ValidationResult;
		}

		// Format zod errors as ValidationError[]
		const procesedErrors =
			result.error?.issues.map((error) => ({
				...error,
				path: error.path.join("."),
				message: error.message,
			})) ?? [];

		return {
			isValid: false,
			schemaErrors: procesedErrors,
			logicErrors,
			schemaVersion: protocol.schemaVersion,
			schemaForced: false,
		} as ValidationResult;
	} catch (e) {
		const error = ensureError(e);

		throw new Error(`Protocol validation failed due to an internal error: ${error.message}`);
	}
};

export const validateProtocol = async (protocol: Protocol, forceSchemaVersion?: number) => {
	if (protocol === undefined) {
		throw new Error("Protocol is undefined");
	}

	// Some very early protocols used semantic versioning. Cast them as schema 1.
	if (protocol.schemaVersion.toString() === "1.0.0") {
		// biome-ignore lint/style/noParameterAssign: seems like the neatest way to do this
		forceSchemaVersion = 1;
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
