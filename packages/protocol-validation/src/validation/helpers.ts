import type { Codebook, EntityTypeDefinition, FilterRule, NcNode, StageSubject } from "@codaco/shared-consts";
import { get } from "es-toolkit/compat";
import type { ValidationError } from "src";

// For some error types, AJV returns info separate from message
const additionalErrorInfo = (errorObj: ValidationError) => {
	if (!errorObj.params) {
		return undefined;
	}

	return "additionalProperty" in errorObj.params
		? errorObj.params.additionalProperty
		: "allowedValues" in errorObj.params
			? errorObj.params.allowedValues
			: "allowedValue" in errorObj.params
				? errorObj.params.allowedValue
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

export const nodeVarsIncludeDisplayVar = (node: NcNode) =>
	!node.displayVariable || // displayVariable is optional
	Object.keys(node.attributes).some((variableId) => variableId === node.displayVariable);

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
	return codebook[entityType]?.[rule.options.type];
};

export const getVariablesForSubject = (codebook: Codebook, subject: StageSubject) => {
	if (subject && subject.entity === "ego") {
		return get(codebook, ["ego", "variables"], {});
	}

	return get(codebook, [subject.entity, subject.type, "variables"], {});
};

export const getVariableNameFromID = (codebook: Codebook, subject:StageSubject, variableID: string) => {
	const variables = getVariablesForSubject(codebook, subject);
	return get(variables, [variableID, "name"], variableID);
};

export const getVariableNames = (registryVars: EntityTypeDefinition['variables']) => Object.values(registryVars).map((vari) => vari.name);

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
