import { get } from "es-toolkit/compat";

export const renderValue = (value: unknown) => {
	if (typeof value === "boolean") {
		return value ? <em>TRUE</em> : <em>FALSE</em>;
	}

	return value;
};

export const getVariableName = (index: Array<{ id: string; name: string }>, variableId: string) => {
	const entry = index.find(({ id }) => id === variableId);

	return entry?.name;
};

export const getVariableMeta = (index: Array<{ id: string; [key: string]: unknown }>, variable: string) =>
	index.find(({ id }) => id === variable) || {};

export const getEntityName = (codebook: Record<string, unknown>, entity: string, type: string) =>
	get(codebook, [entity, type, "name"]);
