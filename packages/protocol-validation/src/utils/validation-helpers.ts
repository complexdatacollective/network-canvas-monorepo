import type {
	Codebook,
	EdgeDefinition,
	EntityDefinition,
	FilterRule,
	NodeDefinition,
	StageSubject,
	Variable,
} from "../schemas/8/schema";

/**
 * Check if an entity (node/edge type) exists in the codebook
 */
export const entityExists = (codebook: Codebook, subject: StageSubject): boolean => {
	if (subject.entity === "ego") {
		return codebook.ego !== undefined;
	}

	if (subject.entity === "node") {
		return codebook.node?.[subject.type] !== undefined;
	}

	if (subject.entity === "edge") {
		return codebook.edge?.[subject.type] !== undefined;
	}

	return false;
};

/**
 * Get variables for a subject (entity + type combination)
 */
export const getVariablesForSubject = (codebook: Codebook, subject: StageSubject): Record<string, Variable> => {
	if (subject.entity === "ego") {
		return codebook.ego?.variables || {};
	}

	if (subject.entity === "node") {
		return codebook.node?.[subject.type]?.variables || {};
	}

	if (subject.entity === "edge") {
		return codebook.edge?.[subject.type]?.variables || {};
	}

	return {};
};

/**
 * Check if a variable exists for a given subject
 */
export const variableExists = (codebook: Codebook, subject: StageSubject, variableName: string): boolean => {
	const variables = getVariablesForSubject(codebook, subject);
	return variableName in variables;
};

/**
 * Check if a variable has a specific type
 */
export const variableHasType = (
	codebook: Codebook,
	subject: StageSubject,
	variableName: string,
	expectedType: string,
): boolean => {
	const variables = getVariablesForSubject(codebook, subject);
	const variable = variables[variableName];
	return variable?.type === expectedType;
};

/**
 * Check for duplicate IDs in array of objects with id property
 */
export const findDuplicateId = <T extends { id: string }>(items: T[]): string | null => {
	const seen = new Set<string>();
	for (const item of items) {
		if (seen.has(item.id)) {
			return item.id;
		}
		seen.add(item.id);
	}
	return null;
};

/**
 * Check for duplicate names in array
 */
export const findDuplicateName = (names: string[]): string | null => {
	const seen = new Set<string>();
	for (const name of names) {
		if (seen.has(name)) {
			return name;
		}
		seen.add(name);
	}
	return null;
};

/**
 * Get all entity names from codebook for duplicate checking
 */
export const getAllEntityNames = (codebook: Codebook): string[] => {
	const names: string[] = [];

	if (codebook.node) {
		names.push(...(Object.values(codebook.node) as NodeDefinition[]).map((entity) => entity.name));
	}

	if (codebook.edge) {
		names.push(...(Object.values(codebook.edge) as EdgeDefinition[]).map((entity) => entity.name));
	}

	return names;
};

/**
 * Get all variable names for an entity definition
 */
export const getVariableNames = (variables?: EntityDefinition["variables"]): string[] => {
	if (!variables) return [];
	return (Object.values(variables) as Variable[]).map((v) => v.name);
};

/**
 * Check if filter rule entity exists in codebook
 */
export const filterRuleEntityExists = (rule: FilterRule, codebook: Codebook): boolean => {
	if (rule.type === "ego") {
		return codebook.ego !== undefined;
	}

	return Boolean(codebook[rule.type]?.[rule.options.type || ""]);
};

/**
 * Check if filter rule attribute exists
 */
export const filterRuleAttributeExists = (rule: FilterRule, codebook: Codebook): boolean => {
	if (!rule.options.attribute) return true; // No attribute to check

	if (rule.type === "ego") {
		return Boolean(codebook.ego?.variables?.[rule.options.attribute]);
	}

	const entity = codebook[rule.type]?.[rule.options.type || ""];
	return Boolean(entity?.variables?.[rule.options.attribute]);
};

/**
 * Create validation error message with context
 */
export const createValidationMessage = (
	baseMessage: string,
	context?: { subject?: StageSubject; variable?: string; entity?: string },
) => {
	let message = baseMessage;

	if (context?.subject) {
		if (context.subject.entity === "ego") {
			message += " (ego entity)";
		} else {
			message += ` (${context.subject.entity}[${context.subject.type}])`;
		}
	}

	if (context?.variable) {
		message += ` - variable: "${context.variable}"`;
	}

	if (context?.entity) {
		message += ` - entity: "${context.entity}"`;
	}

	return message;
};
