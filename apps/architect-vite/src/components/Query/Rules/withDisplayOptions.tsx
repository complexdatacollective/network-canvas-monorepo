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
	const entityType = type === "alter" ? "node" : "edge";
	const entityRoot = type === "ego" ? (["ego"] as const) : ([entityType, options.type] as const);
	const typeLabel = get(codebook, [entityType, options.type, "name"] as const, options.type); // noop for ego
	const typeColor = get(codebook, [entityType, options.type, "color"] as const, "#000"); // noop for ego
	const variableLabel = get(
		codebook,
		[...entityRoot, "variables", options.attribute, "name"] as unknown[],
		options.attribute,
	);

	const variableType = get(
		codebook,
		[...entityRoot, "variables", options.attribute, "type"] as unknown[],
		"string",
	) as string;

	const variableOptions = get(codebook, [...entityRoot, "variables", options.attribute, "options"] as unknown[]) as
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
