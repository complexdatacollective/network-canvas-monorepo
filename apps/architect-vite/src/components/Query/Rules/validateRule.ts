import { isArray, isEmpty, isNil } from "lodash";
import { operatorsWithOptionCount, operatorsWithValue } from "./options";

type RuleOptions = {
	operator?: string;
	attribute?: string;
	type?: string;
	value?: unknown;
	[key: string]: unknown;
};

type Rule = {
	type: string;
	options?: RuleOptions;
	id?: string;
};

const validateField = (value: unknown): boolean => {
	if (isArray(value)) {
		return value.length > 0;
	}
	const type = typeof value;
	switch (type) {
		case "string":
			return !isEmpty(value);
		case "boolean":
			return true;
		case "number":
			return true;
		case "undefined":
			return false;
		default:
			return !isNil(value);
	}
};

const validateFields = (fields: string[] = [], options: RuleOptions = {}): boolean =>
	fields.every((field) => validateField(options[field]));

const validateRule = (rule: Rule | null): boolean => {
	if (!rule) return false;

	const options = rule.options || {};

	switch (rule.type) {
		case "alter": {
			if (Object.hasOwn(options, "attribute")) {
				if (operatorsWithValue.has(options.operator) || operatorsWithOptionCount.has(options.operator)) {
					return validateFields(["type", "attribute", "operator", "value"], options);
				}
				return validateFields(["type", "attribute", "operator"], options);
			}
			return validateFields(["type", "operator"], options);
		}
		case "ego": {
			if (operatorsWithValue.has(options.operator) || operatorsWithOptionCount.has(options.operator)) {
				return validateFields(["attribute", "operator", "value"], options);
			}
			return validateFields(["attribute", "operator"], options);
		}
		case "edge":
			if (Object.hasOwn(options, "attribute")) {
				if (operatorsWithValue.has(options.operator) || operatorsWithOptionCount.has(options.operator)) {
					return validateFields(["type", "attribute", "operator", "value"], options);
				}
				return validateFields(["type", "attribute", "operator"], options);
			}
			return validateFields(["type", "operator"], options);
		default:
			return false;
	}
};

export type { Rule, RuleOptions };

export default validateRule;
