import { get } from "es-toolkit/compat";
import { withProps } from "recompose";

type OptionItem = {
	value: string | number;
	label: string;
};

type InputProps = {
	type: string;
	options: {
		type?: string;
		attribute?: string;
		value?: string | number | (string | number)[];
		[key: string]: unknown;
	};
	codebook: {
		node?: Record<string, { name: string; color: string; variables?: Record<string, unknown> }>;
		edge?: Record<string, { name: string; color: string; variables?: Record<string, unknown> }>;
		ego?: { variables?: Record<string, unknown> };
		[key: string]: unknown;
	};
};

// convert options to labels
const withDisplayOptions = withProps<{ options: unknown }, InputProps>(({ type, options, codebook }: InputProps) => {
	const entityType = type === "node" ? "node" : "edge";
	const typeLabel = options.type ? get(codebook, [entityType, options.type, "name"], options.type) : options.type; // noop for ego
	const typeColor = options.type ? get(codebook, [entityType, options.type, "color"], "#000") : "#000"; // noop for ego
	const variablePath =
		options.attribute && type === "ego"
			? (["ego", "variables", options.attribute, "name"] as const)
			: options.attribute && options.type
				? ([entityType, options.type, "variables", options.attribute, "name"] as const)
				: null;
	const variableLabel = variablePath ? get(codebook, variablePath, options.attribute) : options.attribute;

	const variableTypePath =
		options.attribute && type === "ego"
			? (["ego", "variables", options.attribute, "type"] as const)
			: options.attribute && options.type
				? ([entityType, options.type, "variables", options.attribute, "type"] as const)
				: null;
	const variableType = (variableTypePath ? get(codebook, variableTypePath, "string") : "string") as string;

	const variableOptionsPath =
		options.attribute && type === "ego"
			? (["ego", "variables", options.attribute, "options"] as const)
			: options.attribute && options.type
				? ([entityType, options.type, "variables", options.attribute, "options"] as const)
				: null;
	const variableOptions = (variableOptionsPath ? get(codebook, variableOptionsPath) : undefined) as
		| OptionItem[]
		| undefined;

	const valueOption = variableOptions?.find(({ value }: OptionItem) => value === options.value);

	const valueWithFormatting = () => {
		const getOptionLabel = (item: string | number) => {
			const option = variableOptions?.find(({ value: optionValue }: OptionItem) => optionValue === item);
			return option ? option.label : item;
		};

		// Fetch option label based on value if available
		switch (variableType) {
			case "categorical":
			case "ordinal":
				if (Array.isArray(options.value)) {
					return options.value.map(getOptionLabel);
				}

				return getOptionLabel(options.value as string | number);
			default:
				return valueOption ? valueOption.label : options.value;
		}
	};

	return {
		options: {
			...options,
			...(typeLabel ? { typeLabel } : {}),
			...(typeColor ? { typeColor } : {}),
			attribute: variableLabel,
			variableType,
			value: valueWithFormatting(),
		},
	};
});

export default withDisplayOptions;
