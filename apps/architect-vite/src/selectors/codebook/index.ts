import type { Codebook, EdgeDefinition, EgoDefinition, NodeDefinition, Variables } from "@codaco/protocol-validation";
import { createSelector } from "@reduxjs/toolkit";
import { find, get, isObject } from "es-toolkit/compat";
import type { RootState } from "~/ducks/store";
import { getCodebook } from "../protocol";
import { asOptions } from "../utils";
import { type GetIsUsedOptions, makeOptionsWithIsUsedSelector } from "./isUsed";

// Types
type Subject = {
	entity: "node" | "edge" | "ego";
	type?: string;
};

type VariableWithEntity = {
	uuid: string;
	name: string;
	entity: "node" | "edge" | "ego";
	entityType: string | null;
	type: string;
};

type VariableOption = {
	label: string;
	value: string;
	type?: string;
	color?: string;
	isUsed?: boolean;
};

type NodeTypes = Record<string, NodeDefinition>;
type EdgeTypes = Record<string, EdgeDefinition>;

// Basic selectors
export const getNodeTypes = createSelector(
	[getCodebook],
	(codebook): NodeTypes => get(codebook, "node", {}) as NodeTypes,
);

export const getEdgeTypes = createSelector(
	[getCodebook],
	(codebook): EdgeTypes => get(codebook, "edge", {}) as EdgeTypes,
);

// Memoized selector for getting a specific type
const getTypeSelector = createSelector(
	[getCodebook, (_state: RootState, subject: Subject) => subject],
	(codebook, subject): NodeDefinition | EdgeDefinition | EgoDefinition | null => {
		if (!subject || !codebook) {
			return null;
		}
		const path = subject.type ? [subject.entity, subject.type] : [subject.entity];
		return get(codebook, path, null) as NodeDefinition | EdgeDefinition | EgoDefinition | null;
	},
);

export const getType = (state: RootState, subject: Subject) => getTypeSelector(state, subject);

// Memoized selector for getting variables for a subject
export const getVariablesForSubjectSelector = createSelector(
	[getCodebook, (_state: RootState, subject: Subject) => subject],
	(codebook, subject): Variables => {
		if (!subject || !codebook) return {};
		const path = subject.type ? [subject.entity, subject.type, "variables"] : [subject.entity, "variables"];
		return get(codebook, path, {}) as Variables;
	},
);

export const getVariablesForSubject = (state: RootState, subject: Subject): Variables =>
	getVariablesForSubjectSelector(state, subject);

// Memoized selector for getting all variables flattened by UUID
const _getAllVariablesByUUIDSelector = createSelector([getCodebook], (codebook): Variables => {
	if (!codebook) {
		return {};
	}

	const { node: nodeTypes = {}, edge: edgeTypes = {}, ego } = codebook;
	const flattenedVariables: Variables = {};

	const addVariables = (variables: Variables | null | undefined) => {
		if (!variables || !isObject(variables)) {
			return;
		}

		for (const [uuid, variable] of Object.entries(variables)) {
			flattenedVariables[uuid] = variable;
		}
	};

	// Process node types
	for (const nodeType of Object.values(nodeTypes) as NodeDefinition[]) {
		addVariables(nodeType.variables);
	}

	// Process edge types
	for (const edgeType of Object.values(edgeTypes) as EdgeDefinition[]) {
		addVariables(edgeType.variables);
	}

	// Process ego variables
	if (ego?.variables) {
		addVariables(ego.variables);
	}

	return flattenedVariables;
});

// Legacy function for backward compatibility
export const getAllVariablesByUUID = (codebook: Codebook): Variables => {
	if (!codebook) {
		return {};
	}

	const { node: nodeTypes = {}, edge: edgeTypes = {}, ego } = codebook;
	const flattenedVariables: Variables = {};

	const addVariables = (variables: Variables | null | undefined) => {
		if (!variables || !isObject(variables)) {
			return;
		}

		for (const [uuid, variable] of Object.entries(variables)) {
			flattenedVariables[uuid] = variable;
		}
	};

	// Process node types
	for (const nodeType of Object.values(nodeTypes) as NodeDefinition[]) {
		addVariables(nodeType.variables);
	}

	// Process edge types
	for (const edgeType of Object.values(edgeTypes) as EdgeDefinition[]) {
		addVariables(edgeType.variables);
	}

	// Process ego variables
	if (ego?.variables) {
		addVariables(ego.variables);
	}

	return flattenedVariables;
};

// Memoized selector for getting all variables with entity information
const getAllVariablesByEntitySelector = createSelector([getCodebook], (codebook): VariableWithEntity[] => {
	if (!codebook) return [];

	const variables: VariableWithEntity[] = [];
	const { node: nodeTypes = {}, edge: edgeTypes = {}, ego } = codebook;

	// Process nodes
	for (const [nodeType, typeData] of Object.entries(nodeTypes) as [string, NodeDefinition][]) {
		const nodeVariables = typeData.variables || {};
		for (const [uuid, variable] of Object.entries(nodeVariables)) {
			if (!variable || typeof variable !== "object") continue;
			variables.push({
				uuid,
				name: (variable as { name: string }).name,
				entity: "node",
				entityType: nodeType,
				type: (variable as { type: string }).type,
			});
		}
	}

	// Process edges
	for (const [edgeType, typeData] of Object.entries(edgeTypes) as [string, EdgeDefinition][]) {
		const edgeVariables = typeData.variables || {};
		for (const [uuid, variable] of Object.entries(edgeVariables)) {
			if (!variable || typeof variable !== "object") continue;
			variables.push({
				uuid,
				name: (variable as { name: string }).name,
				entity: "edge",
				entityType: edgeType,
				type: (variable as { type: string }).type,
			});
		}
	}

	// Process ego
	const egoVariables = ego?.variables || {};
	for (const [uuid, variable] of Object.entries(egoVariables)) {
		if (!variable || typeof variable !== "object") continue;
		variables.push({
			uuid,
			name: (variable as { name: string }).name,
			entity: "ego",
			entityType: null,
			type: (variable as { type: string }).type,
		});
	}

	return variables;
});

// Legacy function for backward compatibility
export const getAllVariableUUIDsByEntity = (codebook: Codebook): VariableWithEntity[] => {
	if (!codebook) return [];

	const variables: VariableWithEntity[] = [];
	const { node: nodeTypes = {}, edge: edgeTypes = {}, ego } = codebook;

	// Process nodes
	for (const [nodeType, typeData] of Object.entries(nodeTypes) as [string, NodeDefinition][]) {
		const nodeVariables = typeData.variables || {};
		for (const [uuid, variable] of Object.entries(nodeVariables)) {
			if (!variable || typeof variable !== "object") continue;
			variables.push({
				uuid,
				name: (variable as { name: string }).name,
				entity: "node",
				entityType: nodeType,
				type: (variable as { type: string }).type,
			});
		}
	}

	// Process edges
	for (const [edgeType, typeData] of Object.entries(edgeTypes) as [string, EdgeDefinition][]) {
		const edgeVariables = typeData.variables || {};
		for (const [uuid, variable] of Object.entries(edgeVariables)) {
			if (!variable || typeof variable !== "object") continue;
			variables.push({
				uuid,
				name: (variable as { name: string }).name,
				entity: "edge",
				entityType: edgeType,
				type: (variable as { type: string }).type,
			});
		}
	}

	// Process ego
	const egoVariables = ego?.variables || {};
	for (const [uuid, variable] of Object.entries(egoVariables)) {
		if (!variable || typeof variable !== "object") continue;
		variables.push({
			uuid,
			name: (variable as { name: string }).name,
			entity: "ego",
			entityType: null,
			type: (variable as { type: string }).type,
		});
	}

	return variables;
};

// Factory for creating a memoized selector for a specific variable
export const makeGetVariableWithEntity = (uuid: string) =>
	createSelector([getAllVariablesByEntitySelector], (variables) => find(variables, { uuid }));

// Legacy function for backward compatibility
export const makeGetVariable = (uuid: string) => (state: RootState) => {
	const codebook = getCodebook(state);
	if (!codebook) return null;
	const variables = getAllVariablesByUUID(codebook);
	return get(variables, uuid, null);
};

// Create a properly memoized selector factory for variable options
const createVariableOptionsSelector = () => {
	const cache = new Map<string, ReturnType<typeof createSelector>>();

	return (isUsedOptions: GetIsUsedOptions = {}) => {
		const cacheKey = JSON.stringify(isUsedOptions);

		if (!cache.has(cacheKey)) {
			const selector = createSelector(
				[(state: RootState) => state, (_state: RootState, variables: Variables) => variables],
				(state, variables): VariableOption[] => {
					const options = asOptions(variables);
					const optionsWithIsUsedSelector = makeOptionsWithIsUsedSelector(isUsedOptions);
					return optionsWithIsUsedSelector(state, options);
				},
			);
			cache.set(cacheKey, selector);
		}

		const cachedSelector = cache.get(cacheKey);
		if (!cachedSelector) {
			throw new Error(`Selector not found in cache for key: ${cacheKey}`);
		}
		return cachedSelector;
	};
};

// Create the cached factory instance
const getVariableOptionsSelector = createVariableOptionsSelector();

// Main selector for getting variable options - properly memoized
export const getVariableOptionsForSubjectSelector = createSelector(
	[
		(state: RootState) => state,
		getVariablesForSubjectSelector,
		(_state: RootState, _subject: Subject, isUsedOptions: GetIsUsedOptions = {}) => isUsedOptions,
	],
	(state, variables, isUsedOptions): VariableOption[] => {
		const selector = getVariableOptionsSelector(isUsedOptions);
		return selector(state, variables);
	},
);

export const getVariableOptionsForSubject = (
	state: RootState,
	subject: Subject,
	isUsedOptions: GetIsUsedOptions = {},
): VariableOption[] => getVariableOptionsForSubjectSelector(state, subject, isUsedOptions);

// Internal memoized selector for getting options for a specific variable (used by getOptionsForVariable below)
const getOptionsForVariableSelector = createSelector(
	[getVariablesForSubjectSelector, (_state: RootState, _subject: Subject, variable: string) => variable],
	(variables, variable): unknown[] => {
		return get(variables, [variable, "options"], []);
	},
);

// Get options for a specific variable
export const getOptionsForVariable = (
	state: RootState,
	{ entity, type, variable }: { entity: "node" | "edge" | "ego"; type?: string; variable: string },
): unknown[] => {
	return getOptionsForVariableSelector(state, { entity, type }, variable);
};
