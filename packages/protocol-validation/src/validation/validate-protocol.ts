import { ensureError } from "@codaco/shared-consts";
import { type VersionedProtocol, VersionedProtocolSchema } from "../schemas";

/**
 * Enhanced validateProtocol that uses Zod 4 with integrated cross-reference validation.
 * All validation logic (schema + cross-references) is now handled natively by Zod.
 * Returns Zod's SafeParseReturnType directly.
 */
const validateProtocol = async (protocol: VersionedProtocol) => {
	if (protocol === undefined) {
		throw new Error("Protocol is undefined");
	}

	try {
		return await VersionedProtocolSchema.safeParseAsync(protocol);
	} catch (e) {
		const error = ensureError(e);

		throw new Error(`Protocol validation failed due to an internal error: ${error.message}`);
	}
};

export default validateProtocol;
