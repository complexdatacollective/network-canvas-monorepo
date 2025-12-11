import type { CurrentProtocol } from "@codaco/protocol-validation";

/**
 * Removes app state props that aren't part of the protocol schema.
 * Used before validation to ensure only schema-valid properties are checked.
 */
export function buildCleanProtocol(protocol: CurrentProtocol): CurrentProtocol {
	const { name, isValid, lastSavedAt, lastSavedTimeline, ...cleanProtocol } = protocol as CurrentProtocol & {
		name?: string;
		isValid?: boolean;
		lastSavedAt?: string;
		lastSavedTimeline?: string;
	};

	return cleanProtocol;
}
