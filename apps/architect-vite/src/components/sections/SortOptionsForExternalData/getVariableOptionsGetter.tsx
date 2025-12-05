import { map } from "lodash";

export type VariableOption = {
	value: string;
	[key: string]: unknown;
};

/**
 * Creates a optionGetter function for <MultiSelect />
 *
 * This optionGetter is for variableOptions, which defines properties for the `variable` column.
 */
const getVariableOptionsGetter =
	(variableOptions: VariableOption[]) =>
	(_property: unknown, _rowValues: unknown, allValues: Array<Record<string, unknown>>) => {
		const used = map(allValues, "variable");

		return variableOptions.map((option: VariableOption) =>
			!used.includes(option.value) ? option : { ...option, disabled: true },
		);
	};

export default getVariableOptionsGetter;
