import { omit } from "lodash";
import { withHandlers } from "recompose";
import { isValidationWithListValue, isValidationWithNumberValue, isValidationWithoutValue } from "./options";

type ValidationValue = boolean | number | string | null;

/**
 * Function called when a validation is added or updated. Returns a value
 * based on the validation type, and the previous value (if any).
 *
 * @param {string} type - The validation type.
 * @param {string} oldType - The previous validation type.
 * @param {string} value - The current value.
 * @returns {string} The new value.
 */
const getAutoValue = (type: string, oldType: string | null, value: ValidationValue): ValidationValue => {
	// If the validation type doesn't require a value, return true.
	if (isValidationWithoutValue(type)) {
		return true;
	}

	// If the new type and the old type are both numbers, keep the value
	if (isValidationWithNumberValue(type) && oldType && isValidationWithNumberValue(oldType)) {
		return value;
	}

	// If the new type and the old type both reference variables, keep the value.
	if (isValidationWithListValue(type) && oldType && isValidationWithListValue(oldType)) {
		return value;
	}

	// Otherwise, set an empty value to force the user to enter a value.
	return null;
};

const getUpdatedValue = (
	previousValue: Record<string, ValidationValue>,
	key: string,
	value: ValidationValue,
	oldKey: string | null = null,
): Record<string, ValidationValue> => {
	const autoValue = getAutoValue(key, oldKey, value);

	if (!oldKey) {
		return { ...previousValue, [key]: autoValue };
	}

	return {
		...omit(previousValue, oldKey),
		[key]: autoValue,
	};
};

type HandlerProps = {
	update: (value: Record<string, ValidationValue>) => void;
	value: Record<string, ValidationValue>;
	setAddNew?: (value: boolean) => void;
};

const withUpdateHandlers = withHandlers<HandlerProps, object>({
	handleDelete:
		({ update, value: previousValue }: HandlerProps) =>
		(key: string) => {
			const newValue = omit(previousValue, key);
			update(newValue);
		},
	handleChange:
		({ update, value: previousValue }: HandlerProps) =>
		(key: string, value: ValidationValue, oldKey?: string) => {
			const newValue = getUpdatedValue(previousValue, key, value, oldKey ?? null);
			update(newValue);
		},
	handleAddNew:
		({ update, value: previousValue, setAddNew }: HandlerProps) =>
		(key: string, value: ValidationValue) => {
			const newValue = getUpdatedValue(previousValue, key, value);
			update(newValue);
			setAddNew?.(false);
		},
});

export default withUpdateHandlers;
