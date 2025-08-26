import { get } from "es-toolkit/compat";

export const renderValue = (value: unknown) => {
	if (typeof value === "boolean") {
		return value ? <em>TRUE</em> : <em>FALSE</em>;
	}

	return value;
};

export const getVariableName = (index: any[], variableId: string) => {
	const entry = index.find(({ id }) => id === variableId);

	return entry?.name;
};

export const getVariableMeta = (index: any[], variable: string) => index.find(({ id }) => id === variable) || {};

export const getEntityName = (codebook: any, entity: string, type: string) => get(codebook, [entity, type, "name"]);
