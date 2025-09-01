import { get } from "es-toolkit/compat";
import type { ValidationError } from "./validate-protocol";
import type { Codebook, EntityDefinition, FilterRule, StageSubject } from "../schemas/8/schema";

// Legacy error type with additional parameters
type LegacyValidationError = ValidationError & {
	params?: {
		additionalProperty?: string;
		allowedValues?: string[];
		allowedValue?: string;
	};
};

// For some error types, legacy validation may return info separate from message
const additionalErrorInfo = (errorObj: ValidationError) => {
	// ValidationError type doesn't have params - this is legacy code
	const legacyObj = errorObj as LegacyValidationError;
	if (!legacyObj.params) {
		return undefined;
	}

	return "additionalProperty" in legacyObj.params
		? legacyObj.params.additionalProperty
		: "allowedValues" in legacyObj.params
			? legacyObj.params.allowedValues
			: "allowedValue" in legacyObj.params
				? legacyObj.params.allowedValue
				: undefined;
};

export const errToString = (errorObj: ValidationError | string) => {
	if (typeof errorObj === "string") {
		return errorObj;
	}

	let str = `${errorObj.path} ${errorObj.message}`;
	const additionalInfo = additionalErrorInfo(errorObj);
	if (additionalInfo) {
		str += `: ${additionalInfo}`;
	}
	return str;
};

/**
 * Check that the entity referenced in a FilterRule is defined in the codebook
 * @param rule
 * @param codebook
 * @returns
 */
export const getRuleEntityCodebookDefinition = (rule: FilterRule, codebook: Codebook) => {
	if (rule.type === "ego") {
		return codebook.ego;
	}

	// We need to do this because FilterRule uses 'edge'|'alter' and the codebook uses 'edge'|'node'
	const entityType = rule.type === "edge" ? "edge" : "node";
	return rule.options.type ? codebook[entityType]?.[rule.options.type] : undefined;
};

export const getVariablesForSubject = (codebook: Codebook, subject: StageSubject) => {
	if (subject && subject.entity === "ego") {
		return get(codebook, ["ego", "variables"], {});
	}

	return get(codebook, [subject.entity, subject.type, "variables"], {});
};

export const getVariableNameFromID = (codebook: Codebook, subject: StageSubject, variableID: string) => {
	const variables = getVariablesForSubject(codebook, subject);
	return get(variables, [variableID, "name"], variableID);
};

export const getVariableNames = (registryVars: EntityDefinition["variables"]) =>
	registryVars ? Object.values(registryVars).map((vari) => vari.name) : [];

export const getEntityNames = (codebook: Codebook) => [
	...Object.values(codebook.node || {}).map((entity) => entity.name),
	...Object.values(codebook.edge || {}).map((entity) => entity.name),
];

/**
 * Check for duplicate IDs in an array of objects
 * @param elements An array of objects with an 'id' key
 * @returns
 */
export const checkDuplicateNestedId = <A extends { id: string }[]>(elements: A) => {
	const set = new Set();
	const dupe = elements.find((el) => {
		// If the map already has the ID, return true
		if (set.has(el.id)) {
			return true;
		}

		// Otherwise, add the ID to the map
		set.add(el.id);
		return false;
	});

	// If we found a duplicate, return the ID
	return dupe?.id;
};

/**
 * Check for duplicate items in an array
 * @param items
 * @returns
 */
export const duplicateInArray = (items: unknown[]) => {
	const set = new Set();
	const dupe = items.find((item) => {
		if (set.has(item)) {
			return true;
		}
		set.add(item);
		return false;
	});
	return dupe;
};
