import { formValueSelector } from "redux-form";
import { createSelector } from "@reduxjs/toolkit";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { getCodebook } from "~/selectors/protocol";
import { asOptions } from "~/selectors/utils";

export const getLayoutVariablesForSubject = (state: any, { entity, type }: { entity: string; type: string }) => {
	const variableOptions = getVariableOptionsForSubject(state, { entity, type });
	const layoutOptions = variableOptions.filter(({ type: variableType }) => variableType === "layout");

	return layoutOptions;
};

export const getHighlightVariablesForSubject = (state: any, { type, entity }: { type: string; entity: string }) => {
	// All defined variables that match nodeType
	const variableOptions = getVariableOptionsForSubject(state, { entity, type });

	// Boolean variables which aren't already used (+ currently selected)
	const highlightVariables = variableOptions.filter(({ type: variableType }) => variableType === "boolean");

	return highlightVariables;
};

export const getEdgesForSubject = createSelector([getCodebook], (codebook) => {
	return asOptions(codebook.edge);
});

export const getEdgeFilters = (state: any) => {
	const getStageValue = formValueSelector("edit-stage");
	const currentFilters = getStageValue(state, "filter");

	if (!currentFilters || !currentFilters.rules) {
		return [];
	}
	const edgeFilters = currentFilters.rules.filter((rule) => rule.type === "edge");

	return edgeFilters;
};
