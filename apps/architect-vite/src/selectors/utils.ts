import type { VariableOptions } from "@codaco/protocol-validation";
import { map, pickBy } from "lodash";

const extraProperties = new Set(["type", "color"]);
const typesWithOptions = new Set(["categorical", "ordinal"]);

type Item = {
	name: string;
	type?: string;
	color?: string;
	options?: VariableOptions;
	[key: string]: unknown;
};

type Option = {
	label: string;
	value: string;
	type?: string;
	color?: string;
	options?: VariableOptions;
};

const asOption = (item: Item, id: string): Option => {
	const required = {
		label: item.name,
		value: id,
	};
	const extra = pickBy(item, (value, key) => value && extraProperties.has(key)) as Pick<Option, "type" | "color">;

	// Include options for categorical/ordinal variables
	const optionsField = item.type && typesWithOptions.has(item.type) && item.options ? { options: item.options } : {};

	return {
		...extra,
		...optionsField,
		...required,
	};
};

export const asOptions = (items: Record<string, Item>): Option[] => map(items, asOption);
