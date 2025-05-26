import { map } from "es-toolkit/compat";
import { getVariableOptionsForSubject } from "~/src/selectors/codebook";
import { getCodebook } from "~/src/selectors/protocol";

export const getNarrativeVariables = (state, subject) => {
	const variables = getVariableOptionsForSubject(state, subject);

	const layoutVariablesForSubject = variables.filter(({ type }) => type === "layout");
	const highlightVariablesForSubject = variables.filter(({ type }) => type === "boolean");
	const categoricalOptions = variables.filter(({ type }) => type === "categorical");

	return {
		layoutVariablesForSubject,
		highlightVariablesForSubject,
		groupVariablesForSubject: categoricalOptions,
	};
};

export const getEdgesForSubject = (state) => {
	const codebook = getCodebook(state);

	return map(codebook.edge, (edge, edgeId) => ({
		label: edge.name,
		color: edge.color,
		value: edgeId,
	}));
};
