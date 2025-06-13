import { map, pickBy } from "lodash";

const extraProperties = new Set(["type", "color"]);

type Item = {
	name: string;
	type?: string;
	color?: string;
	[key: string]: any;
};

type Option = {
	label: string;
	value: string;
	type?: string;
	color?: string;
};

const asOption = (item: Item, id: string): Option => {
	const required = {
		label: item.name,
		value: id,
	};
	const extra = pickBy(item, (value, key) => value && extraProperties.has(key)) as Pick<Option, "type" | "color">;
	return {
		...extra,
		...required,
	};
};

export const asOptions = (items: Record<string, Item>): Option[] => map(items, asOption);