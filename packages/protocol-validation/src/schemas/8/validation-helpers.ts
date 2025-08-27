import type { Codebook, StageSubject, FilterRule, Variable } from "./schema";

/**
 * Helper functions for cross-reference validation within Protocol schemas
 */

export type ValidationContext = {
	codebook: Codebook;
	stages?: unknown[];
};

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
		names.push(...Object.values(codebook.node).map((entity) => entity.name));
	}

	if (codebook.edge) {
		names.push(...Object.values(codebook.edge).map((entity) => entity.name));
	}

	return names;
};

/**
 * Get all variable names for an entity definition
 */
export const getVariableNames = (variables?: Record<string, Variable>): string[] => {
	if (!variables) return [];
	return Object.values(variables).map((v) => v.name);
};

/**
 * Check if filter rule entity exists in codebook
 */
export const filterRuleEntityExists = (rule: FilterRule, codebook: Codebook): boolean => {
	if (rule.type === "ego") {
		return codebook.ego !== undefined;
	}

	const entityType = rule.type === "alter" ? "node" : rule.type;
	return !!codebook[entityType]?.[rule.options.type || ""];
};

/**
 * Check if filter rule attribute exists
 */
export const filterRuleAttributeExists = (rule: FilterRule, codebook: Codebook): boolean => {
	if (!rule.options.attribute) return true; // No attribute to check

	if (rule.type === "ego") {
		return !!codebook.ego?.variables?.[rule.options.attribute];
	}

	const entityType = rule.type === "alter" ? "node" : rule.type;
	const entity = codebook[entityType]?.[rule.options.type || ""];
	return !!entity?.variables?.[rule.options.attribute];
};

/**
 * Create a Zod refine function for stage subject validation
 */
export const createStageSubjectValidator = (codebook: Codebook) => {
	return (subject: StageSubject) => {
		return entityExists(codebook, subject);
	};
};

/**
 * Create a Zod refine function for form field validation
 */
export const createFormFieldValidator = (codebook: Codebook, subject?: StageSubject) => {
	return (field: { variable: string }) => {
		if (!subject) return false;
		return variableExists(codebook, subject, field.variable);
	};
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
