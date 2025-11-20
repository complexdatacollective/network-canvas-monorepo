import { isEmpty } from "lodash";

const CSSVariable = (variableName: string): string | null => {
	if (document.readyState !== "complete") {
	}

	const variable = getComputedStyle(document.body).getPropertyValue(variableName).trim();
	if (isEmpty(variable)) {
		return null;
	}
	return variable;
};

export const getCSSVariableAsNumber = (variableName: string): number => {
	const variable = CSSVariable(variableName);
	return Number.parseInt(variable || "0", 10);
};

export const getCSSVariableAsObject = (variableName: string): unknown => {
	const variable = CSSVariable(variableName);
	return variable ? JSON.parse(variable) : null;
};
