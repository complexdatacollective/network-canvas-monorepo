import type { IndexEntry } from "./SummaryContext";

export const renderValue = (value: string | number | boolean | unknown) => {
	if (typeof value === "boolean") {
		return value ? <em>TRUE</em> : <em>FALSE</em>;
	}

	return String(value);
};

export const getVariableName = (index: IndexEntry[], variableId: string): string => {
	const entry = index.find(({ id }) => id === variableId);

	return entry?.name ?? "";
};

export const getVariableMeta = (
	index: IndexEntry[],
	variable: string,
): Pick<IndexEntry, "id" | "name" | "type" | "component"> => {
	const entry = index.find(({ id }) => id === variable);
	return (
		entry ?? {
			id: "",
			name: "",
			type: "",
			component: undefined,
		}
	);
};
