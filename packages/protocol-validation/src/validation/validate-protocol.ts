import z from "zod";
import { type VersionedProtocol, VersionedProtocolSchema } from "../schemas";
import { ensureError } from "../utils/ensureError";

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
				errors: null,
			};
		}

		const tree = z.treeifyError(result.error);

		return {
			isValid: false,
			errors: tree,
		};
	} catch (e) {
		const error = ensureError(e);

		throw new Error(`Protocol validation failed due to an internal error: ${error.message}`);
	}
};

export default validateProtocol;
