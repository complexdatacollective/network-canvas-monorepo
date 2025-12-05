import { get, map, reduce } from "lodash";
import { withProps } from "recompose";
import { operatorsAsOptions, operatorsByType, validTypes } from "./options";

type Variable = {
	name: string;
	type: string;
	[key: string]: unknown;
};

type OptionType = {
	value: string;
	label: string;
	color?: string;
};

const getVariablesAsOptions = (variables: Record<string, Variable>): OptionType[] => {
	const variablesAsOptions = reduce(
		variables,
		(acc, variable, variableId) => {
			if (!validTypes.has(variable.type)) {
				return acc;
			}
			return [
				...acc,
				{
					value: variableId,
					label: variable.name,
				},
			];
		},
		[] as OptionType[],
	);

	return variablesAsOptions;
};

const getOperatorsForType = (type: string | null): OptionType[] => {
	const operatorsForType = get(operatorsByType, type ?? "exists", operatorsByType.exists);

	return operatorsAsOptions.filter(({ value }) => value && operatorsForType.has(value)) as OptionType[];
};

type InputProps = {
	rule: {
		type: string;
		options?: {
			type?: string;
			attribute?: string;
		};
	};
	codebook: {
		node?: Record<string, { name: string; color: string; variables?: Record<string, Variable> }>;
		edge?: Record<string, { name: string; color: string; variables?: Record<string, Variable> }>;
		ego?: { variables?: Record<string, Variable> };
		[key: string]: unknown;
	};
};

type OutputProps = {
	typeOptions: OptionType[];
	variablesAsOptions: OptionType[];
	variableOptions: unknown;
	operatorOptions: OptionType[];
	variableType: string | null;
};

const withOptions = withProps<OutputProps, InputProps>((props: InputProps) => {
	const entityType = get(props.rule, "type");

	const entityId = get(props.rule, "options.type", null);
	const variableId = get(props.rule, "options.attribute", null);

	const variablesRoot = () => {
		if (entityType === "ego") {
			return ["ego", "variables"];
		}

		if (entityType === "node") {
			return ["node", entityId, "variables"];
		}

		return ["edge", entityId, "variables"];
	};

	const entitiesOfType = get(props.codebook, entityType, {}) as Record<string, { name: string; color: string }>;

	const typeOptions = map(entitiesOfType, (entity, id) => ({
		value: id,
		label: entity.name,
		color: entity.color,
	}));

	const variablesAsOptions = getVariablesAsOptions(
		(get(props.codebook, variablesRoot() as never, {}) as Record<string, Variable>) ?? {},
	);

	const variableType = get(props.codebook, [...variablesRoot(), variableId, "type"] as never, null) as string | null as
		| string
		| null;

	const variableOptions = get(props.codebook, [...variablesRoot(), variableId, "options"] as never, null);

	const operatorOptions = getOperatorsForType(variableType);

	return {
		typeOptions,
		variablesAsOptions,
		variableOptions,
		operatorOptions,
		variableType,
	};
});

export default withOptions;
