import { pick } from "lodash";

const DEFAULT_OPTIONS = {
	type: undefined,
	attribute: undefined,
	operator: undefined,
};

const DEFAULT_VALUES: Record<string, unknown> = {
	boolean: false,
	categorical: [],
};

const getDefaultValue = (variableType: string) => DEFAULT_VALUES[variableType] || "";

export const getDefaultOptions = (attributes: string[] | undefined, variableType?: string) => {
	// generate default options object with all possible attributes
	const defaultOptions = {
		...DEFAULT_OPTIONS,
		value: getDefaultValue(variableType || ""),
	};

	if (!attributes) {
		return defaultOptions;
	}

	// return attributes which match this options object
	return pick(defaultOptions, attributes);
};

export const makeGetOptionsWithDefaults =
	(variableType?: string, attributes?: string[]) => (options?: Record<string, unknown>) => ({
		...getDefaultOptions(attributes, variableType),
		...options,
	});
