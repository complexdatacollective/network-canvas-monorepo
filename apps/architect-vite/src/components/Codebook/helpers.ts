import type {
	EdgeDefinition,
	EgoDefinition,
	NodeDefinition,
	Stage,
	Variable,
	Variables,
} from "@codaco/protocol-validation";
import { createSelector } from "@reduxjs/toolkit";
import { compact, get, reduce, uniq } from "es-toolkit/compat";
import type { RootState } from "~/ducks/store";
import { getAllVariablesByUUID, getType } from "~/selectors/codebook";
import { makeGetIsUsed } from "~/selectors/codebook/isUsed";
import { getVariableIndex, utils } from "~/selectors/indexes";
import { getCodebook, getProtocol } from "~/selectors/protocol";

type StageMeta = {
	label: string;
	id: string;
};

/**
 * Extract basic stage meta by index from the app state
 * @param {Object} state Application state
 * @returns {Object[]} Stage meta sorted by index in state
 */
const getStageMetaByIndex = createSelector([getProtocol], (protocol): StageMeta[] => {
	if (!protocol) return [];
	return protocol.stages.map(({ label, id }: Stage) => ({ label, id }));
});

const getVariableMetaByIndex = createSelector([getCodebook], (codebook) => {
	if (!codebook) return {};
	const variables = getAllVariablesByUUID(codebook);
	return variables;
});

/**
 * Extract the stage name from a path string
 * @param {string} path {}
 * @returns {string | null} return a stageIndex or null if stage not found.
 */
const getStageIndexFromPath = (path: string): string | null => {
	const matches = /stages\[([0-9]+)\]/.exec(path);
	return get(matches, 1, null);
};

const codebookVariableReferenceRegex =
	/codebook\.(ego|node\[([^\]]+)\]|edge\[([^\]]+)\])\.variables\[(.*?)\].validation\.(sameAs|differentFrom)/;

const getCodebookVariableIndexFromValidationPath = (path: string): string | null => {
	const match = path.match(codebookVariableReferenceRegex);

	return get(match, 4, null);
};

/**
 * Takes an object in the format of `{[path]: variableID}` and a variableID to
 * search for. Returns an array of paths that match the variableID.
 *
 * @param {Object.<string, string>}} index Usage index in (in format `{[path]: variableID}`)
 * @param {any} value Value to match in usage index
 * @returns {string[]} List of paths ("usage array")
 */
export const getUsage = (index: Record<string, string>, value: string): string[] =>
	reduce(
		index,
		(acc: string[], indexValue: string, path: string) => {
			if (indexValue !== value) {
				return acc;
			}
			return [...acc, path];
		},
		[],
	);

type UsageMeta = {
	label: string;
	id?: string;
};

/**
 * Get stage meta (wtf is stage meta, Steve? 🤦) that matches "usage array"
 * (with duplicates removed).
 *
 * See `getUsage()` for how the usage array is generated.
 *
 * Any stages that can't be found in the index are omitted.
 *
 * @param {Object[]} stageMetaByIndex Stage meta by index (as created by `getStageMetaByIndex()`)
 * @param {Object[]} variableMetaByIndex Variable meta by index (as created by
 * `getVariableMetaByIndex()`)
 * @param {string[]} usageArray "Usage array" as created by `getUsage()`
 * @returns {Object[]} List of stage meta `{ label, id }`.
 */
export const getUsageAsStageMeta = (
	stageMetaByIndex: StageMeta[],
	variableMetaByIndex: Variables,
	usageArray: string[],
): UsageMeta[] => {
	// Filter codebook variables from usage array
	const codebookVariablePaths = usageArray.filter(getCodebookVariableIndexFromValidationPath);
	const codebookVariablesWithMeta = codebookVariablePaths.map((path: string) => {
		const variableId = getCodebookVariableIndexFromValidationPath(path);
		const variable = variableId ? variableMetaByIndex[variableId] : undefined;
		const name = variable?.name;
		return {
			label: `Used as validation for "${name || "unknown"}"`,
		};
	});

	const stageIndexes = compact(uniq(usageArray.map(getStageIndexFromPath)));
	const stageVariablesWithMeta = stageIndexes.map((stageIndex: string) => get(stageMetaByIndex, stageIndex));

	return [...stageVariablesWithMeta, ...codebookVariablesWithMeta];
};

/**
 * Helper function to be used with Array.sort. Sorts a collection of variable
 * definitions by the label property.
 *
 * @param {Object} a { label: string }
 * @param {Object} b { label: string }
 * @returns {number} -1 if a < b, 1 if a > b, 0 if a === b
 */
export const sortByLabel = (a: UsageMeta, b: UsageMeta): number => {
	if (a.label < b.label) {
		return -1;
	}
	if (a.label > b.label) {
		return 1;
	}
	return 0;
};

/**
 * Creates a selector that returns a function for getting entity usage data
 * @param {unknown} index The index to use for searching
 * @param {Record<string, unknown>} mergeProps Props to merge with the result
 * @returns {function} Function that can be used in map operations
 */
export const makeGetEntityWithUsage = (index: Record<string, string>, mergeProps: Record<string, unknown>) =>
	createSelector([getStageMetaByIndex, getVariableMetaByIndex], (stageMetaByIndex, variableMetaByIndex) => {
		const search = utils.buildSearch([index]);

		return (_: unknown, id: string) => {
			const inUse = search.has(id);
			const usage = inUse ? getUsageAsStageMeta(stageMetaByIndex, variableMetaByIndex, getUsage(index, id)) : [];

			return {
				...mergeProps,
				type: id,
				inUse,
				usage,
			};
		};
	});

type EntityPropertiesParams = {
	entity: "node" | "edge" | "ego";
	type?: string;
};

type VariableWithUsage = Variable & {
	id: string;
	inUse: boolean;
	usage?: UsageMeta[];
	usageString?: string;
};

type EntityProperties = {
	name: string;
	color?: string;
	variables: Record<string, VariableWithUsage>;
};

/**
 * Returns entity meta data for use in the codebook.
 * @param {*} state
 * @param {*} param1
 * @returns
 */
export const getEntityProperties = (
	state: RootState,
	{ entity, type }: EntityPropertiesParams,
): EntityProperties | null => {
	const entityType = getType(state, { entity, type });

	if (!entityType) {
		return null;
	}

	// Type guard to check if entityType has name and color
	const hasNameAndColor = (
		def: NodeDefinition | EdgeDefinition | EgoDefinition,
	): def is NodeDefinition | EdgeDefinition => {
		return "name" in def && "color" in def;
	};

	if (!hasNameAndColor(entityType)) {
		return null;
	}

	const { name, color, variables } = entityType;

	const variableIndex = getVariableIndex(state) as Record<string, string>;
	const variableMeta = getVariableMetaByIndex(state);
	const stageMetaByIndex = getStageMetaByIndex(state);
	const isUsedIndex = makeGetIsUsed({ formNames: [] })(state);

	const variablesWithUsage: Record<string, VariableWithUsage> = {};

	for (const [id, variable] of Object.entries(variables || {})) {
		const inUse = get(isUsedIndex, id, false) as boolean;

		const baseProperties: VariableWithUsage = {
			...variable,
			id,
			inUse,
		};

		if (!inUse) {
			variablesWithUsage[id] = baseProperties;
			continue;
		}

		const usage = getUsageAsStageMeta(stageMetaByIndex, variableMeta, getUsage(variableIndex, id)).sort(sortByLabel);

		const usageString = usage
			.map(({ label }: UsageMeta) => label)
			.join(", ")
			.toUpperCase();

		variablesWithUsage[id] = {
			...baseProperties,
			usage,
			usageString,
		};
	}

	return {
		name,
		color,
		variables: variablesWithUsage,
	};
};
