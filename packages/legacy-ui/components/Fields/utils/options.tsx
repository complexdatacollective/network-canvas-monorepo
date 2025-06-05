/* eslint-disable import/prefer-default-export */

import { get, isString } from "lodash";

type Option = string | { value: any; label: string; [key: string]: any };

const toString = (value: any): string => (isString(value) ? value : JSON.stringify(value));

export const getValue = (option: Option): any => get(option, "value", option);

export const getLabel = (option: Option): string => get(option, "label", toString(getValue(option)));

export const asOptionObject = (option: Option): { value: any; label: string; [key: string]: any } => {
	if (typeof option !== "string") {
		return option;
	}
	return {
		value: getValue(option),
		label: getLabel(option),
	};
};
