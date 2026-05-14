import { map } from "es-toolkit/compat";
import type { RootState } from "~/ducks/modules/root";
import { getVariableOptionsForSubject } from "~/selectors/codebook";
import { getCodebook } from "~/selectors/protocol";

type Subject = {
	entity: "node" | "edge" | "ego";
	type?: string;
};

export const getNarrativeVariables = (state: RootState, subject: Subject) => {
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

export const getEdgesForSubject = (state: RootState) => {
	const codebook = getCodebook(state);

	if (!codebook) return [];

	return map(codebook.edge, (edge, edgeId) => ({
		label: edge.name,
		color: edge.color,
		value: edgeId,
	}));
};
