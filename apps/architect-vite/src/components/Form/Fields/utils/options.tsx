import { get, isString } from "lodash";

export type Option = string | { value: unknown; label: string; [key: string]: unknown };

const stringifyValue = (value: unknown): string => (isString(value) ? value : JSON.stringify(value));

export const getValue = (option: Option): unknown => get(option, "value", option);

const getLabel = (option: Option): string => get(option, "label", stringifyValue(getValue(option)));

export const asOptionObject = (option: Option): { value: unknown; label: string; [key: string]: unknown } => {
	if (typeof option !== "string") {
		return option;
	}
	return {
		value: getValue(option),
		label: getLabel(option),
	};
};
