import { type VersionedProtocol, VersionedProtocolSchema } from "src/schemas";
import { ensureError } from "src/utils/ensureError";

export type ValidationError = {
	path?: string;
	message: string;
};

type ValidationResult = {
	isValid: boolean;
	errors: ValidationError[];
	// Legacy properties for backward compatibility (deprecated)
	schemaErrors: ValidationError[];
	logicErrors: ValidationError[];
	schemaVersion: number;
	schemaForced: boolean;
};

/**
 * Enhanced validateProtocol that uses Zod 4 with integrated cross-reference validation.
 * All validation logic (schema + cross-references) is now handled natively by Zod.
 */
const validateProtocol = async (protocol: VersionedProtocol) => {
	if (protocol === undefined) {
		throw new Error("Protocol is undefined");
	}

	try {
		const result = VersionedProtocolSchema.safeParse(protocol);

		if (result.success) {
			return {
				isValid: true,
				errors: [],
				// Legacy properties for backward compatibility (all validation is now unified)
				schemaErrors: [],
				logicErrors: [],
				schemaVersion: protocol.schemaVersion,
				schemaForced: false,
			} as ValidationResult;
		}

		// Format zod errors as ValidationError[]
		// All validation errors (schema + logic) are now unified in Zod's error system
		const processedErrors =
			result.error?.issues.map((error) => ({
				...error,
				path: error.path.join("."),
				message: error.message,
			})) ?? [];

		return {
			isValid: false,
			errors: processedErrors,
			// Legacy properties for backward compatibility
			// Note: All errors are now unified - no separation between schema and logic errors
			schemaErrors: processedErrors,
			logicErrors: [],
			schemaVersion: protocol.schemaVersion,
			schemaForced: false,
		} as ValidationResult;
	} catch (e) {
		const error = ensureError(e);

		throw new Error(`Protocol validation failed due to an internal error: ${error.message}`);
	}
};

export default validateProtocol;
