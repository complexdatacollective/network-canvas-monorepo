import { get } from "es-toolkit/compat";
import type { Codebook, EntityDefinition, FilterRule, StageSubject } from "../schemas/8/schema";

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
	return rule.options.type ? codebook[rule.type]?.[rule.options.type] : undefined;
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

export const getVariableIDs = (registryVars: EntityDefinition["variables"]) =>
	registryVars ? Object.keys(registryVars) : [];

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
