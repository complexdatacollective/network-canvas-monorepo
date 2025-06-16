import { isEmpty } from "lodash";

const CSSVariable = (variableName: string): string | null => {
	if (document.readyState !== "complete") {
		// eslint-disable-next-line no-console
		console.error(
			"You attempted to read the value of a CSS variable before all app resources were loaded! Move calls to getCSSVariableAs* outside of the top level scope of your components.",
		);
	}

	const variable = getComputedStyle(document.body).getPropertyValue(variableName).trim();
	if (isEmpty(variable)) {
		// eslint-disable-next-line no-console
		console.warn(`CSS variable "${variableName}" not found!`);
		return null;
	}
	return variable;
};

export const getCSSVariableAsString = (variableName: string): string | null => CSSVariable(variableName);

export const getCSSVariableAsNumber = (variableName: string): number => {
	const variable = CSSVariable(variableName);
	return Number.parseInt(variable || "0", 10);
};

export const getCSSVariableAsObject = (variableName: string): unknown => {
	const variable = CSSVariable(variableName);
	return variable ? JSON.parse(variable) : null;
};

export const getCSSVariable = (variableName: string): string | number | unknown => {
	const variable = CSSVariable(variableName);

	if (!variable) return null;

	try {
		return JSON.parse(variable);
	} catch (_e) {
		if (Number.parseInt(variable, 10).toString() === variable) {
			return Number.parseInt(variable, 10);
		}

		return variable;
	}
};