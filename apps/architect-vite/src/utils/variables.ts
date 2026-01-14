import type { VariableOptions } from "@codaco/protocol-validation";

/**
 * Checks if two sets of categorical/ordinal options match exactly.
 * Options must have the same length and identical label/value pairs.
 * Used for family tree census to ensure selected variables have the required locked options.
 */
export function optionsMatch(variableOptions: VariableOptions | undefined, lockedOptions: VariableOptions): boolean {
	if (!variableOptions) return false;
	if (variableOptions.length !== lockedOptions.length) return false;

	// Sort both arrays by value for consistent comparison
	const sortedVar = [...variableOptions].sort((a, b) => String(a.value).localeCompare(String(b.value)));
	const sortedLocked = [...lockedOptions].sort((a, b) => String(a.value).localeCompare(String(b.value)));

	return sortedVar.every((opt, i) => opt.value === sortedLocked[i]?.value && opt.label === sortedLocked[i]?.label);
}
