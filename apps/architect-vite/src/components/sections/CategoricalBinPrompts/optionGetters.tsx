import { map } from "lodash";

type VariableOption = {
	value: string;
	label: string;
	type?: string;
};

type OptionProperties = {
	value: string;
	label: string;
	disabled?: boolean;
};

const NON_SORTABLE_TYPES = ["layout"];
const getOptionProperties = (option: VariableOption): OptionProperties => ({
	value: option.value,
	label: option.label,
});

/**
 * Creates a optionGetter function for <MultiSelect />
 *
 * This optionGetter is for sortOrder, which defines properties for `property` and `direction`
 * columns.
 */
const getSortOrderOptionGetter =
	(variableOptions: VariableOption[]) =>
	(property: string, _rowValues: unknown, allValues: Record<string, unknown>[]) => {
		switch (property) {
			case "property": {
				const used = map(allValues, "property") as string[];

				return [{ value: "*", label: "*" }, ...variableOptions]
					.filter((option) => !NON_SORTABLE_TYPES.includes(option.type ?? ""))
					.map((option) =>
						!used.includes(option.value)
							? getOptionProperties(option)
							: { ...getOptionProperties(option), disabled: true },
					);
			}
			case "direction":
				return [
					{ value: "desc", label: "Descending" },
					{ value: "asc", label: "Ascending" },
				];
			default:
				return [];
		}
	};

export { getSortOrderOptionGetter };
