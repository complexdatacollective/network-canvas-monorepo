import type { FilterRule } from "@codaco/protocol-validation";
import { createSelector } from "@reduxjs/toolkit";
import { formValueSelector } from "redux-form";
import type { RootState } from "~/ducks/store";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { getCodebook } from "~/selectors/protocol";
import { asOptions } from "~/selectors/utils";

export const getLayoutVariablesForSubject = (state: RootState, { entity, type }: { entity: string; type: string }) => {
	const variableOptions = getVariableOptionsForSubject(state, {
		entity: entity as "node" | "edge" | "ego",
		type,
	});
	const layoutOptions = variableOptions.filter(({ type: variableType }) => variableType === "layout");

	return layoutOptions;
};

export const getHighlightVariablesForSubject = (
	state: RootState,
	{ type, entity }: { type: string; entity: string },
) => {
	// All defined variables that match nodeType
	const variableOptions = getVariableOptionsForSubject(state, {
		entity: entity as "node" | "edge" | "ego",
		type,
	});

	// Boolean variables which aren't already used (+ currently selected)
	const highlightVariables = variableOptions.filter(({ type: variableType }) => variableType === "boolean");

	return highlightVariables;
};

export const getEdgesForSubject = createSelector([getCodebook], (codebook) => {
	if (!codebook) return [];
	return asOptions(codebook.edge ?? {});
});

type CurrentFilters = {
	rules?: FilterRule[];
	[key: string]: unknown;
};

export const getEdgeFilters = (state: RootState) => {
	const getStageValue = formValueSelector("edit-stage");
	const currentFilters = getStageValue(state, "filter") as CurrentFilters | undefined;

	if (!currentFilters || !currentFilters.rules) {
		return [];
	}
	const edgeFilters = currentFilters.rules.filter((rule: FilterRule) => rule.type === "edge");

	return edgeFilters;
};
