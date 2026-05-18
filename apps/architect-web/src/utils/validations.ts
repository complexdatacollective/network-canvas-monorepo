import {
  get,
  isEmpty,
  isEqual,
  isNil,
  isNull,
  isRegExp,
  isUndefined,
  map,
  toPairs,
} from 'es-toolkit/compat';
import { DateTime } from 'luxon';

type ValidationValue = unknown;
type ValidationMessage = string | undefined;
type ValidationResult = string | undefined;
type Validator = (
  value: ValidationValue,
  allValues?: Record<string, unknown>,
  _?: unknown,
  name?: string,
) => ValidationResult;
type ValidationFactory = (...args: never[]) => Validator;

// Simple function to allow returning a custom message if provided, and
// or defaulting to the default message.
const messageWithDefault = (
  message: ValidationMessage,
  defaultMessage: string,
): string => {
  if (message) {
    return message;
  }
  return defaultMessage;
};

// Return an array of values given either a collection, an array,
// or a single value
const coerceArray = (value: ValidationValue): unknown[] => {
  if (value instanceof Object && !Array.isArray(value)) {
    return (value as { value: unknown }[]).reduce(
      (acc: unknown[], individual: { value: unknown }) => {
        acc.push(individual.value);
        return acc;
      },
      [],
    );
  }
  if (Array.isArray(value)) {
    return value;
  }
  return [];
};

const capitalize = (sentence: string) =>
  sentence.replace(/^\w/, (firstLetter: string) => firstLetter.toUpperCase());

const hasValue = (value: ValidationValue) => {
  if (typeof value === 'string') {
    return !!value;
  }

  return !isNil(value);
};

const isRoughlyEqual = (left: unknown, right: unknown) => {
  if (typeof left === 'string' && typeof right === 'string') {
    return left.toLowerCase() === right.toLowerCase();
  }

  return isEqual(left, right);
};

const required =
  (
    isRequired: boolean | ValidationMessage = true,
    message?: ValidationMessage,
  ): Validator =>
  (value) => {
    const effectiveMessage =
      typeof isRequired === 'string' ? isRequired : message;
    const effectiveRequired =
      typeof isRequired === 'string' ? true : isRequired;
    if (!effectiveRequired) {
      return undefined;
    }

    return hasValue(value)
      ? undefined
      : messageWithDefault(effectiveMessage, 'Required');
  };

const requiredAcceptsZero =
  (isRequired: boolean, message: ValidationMessage): Validator =>
  (value) =>
    !isNil(value) && isRequired
      ? undefined
      : messageWithDefault(message, 'Required');

const requiredAcceptsNull =
  (isRequired: boolean, message: ValidationMessage): Validator =>
  (value) =>
    !isUndefined(value) && isRequired
      ? undefined
      : messageWithDefault(message, 'Required');

const positiveNumber =
  (_: unknown, message: ValidationMessage): Validator =>
  (value) =>
    value && Math.sign(value as number) === -1
      ? messageWithDefault(message, 'Number must be positive')
      : undefined;

const maxLength =
  (max: number, message: ValidationMessage): Validator =>
  (value) =>
    !isNull(value) && !isUndefined(value) && (value as string).length > max
      ? messageWithDefault(message, `Must be ${max} characters or less`)
      : undefined;
const minLength =
  (min: number, message: ValidationMessage): Validator =>
  (value) =>
    isNull(value) || isUndefined(value) || (value as string).length < min
      ? messageWithDefault(message, `Must be ${min} characters or more`)
      : undefined;

const minValue =
  (min: number, message: ValidationMessage): Validator =>
  (value) =>
    !isNull(value) && (value as number) < min
      ? messageWithDefault(message, `Must be at least ${min}`)
      : undefined;
const maxValue =
  (max: number, message: ValidationMessage): Validator =>
  (value) =>
    value && (value as number) > max
      ? messageWithDefault(message, `Must be less than ${max}`)
      : undefined;

const minSelected =
  (min: number, message: ValidationMessage): Validator =>
  (value) =>
    !value || coerceArray(value).length < min
      ? messageWithDefault(
          message,
          `You must choose a minimum of ${min} option(s)`,
        )
      : undefined;
const maxSelected =
  (max: number, message: ValidationMessage): Validator =>
  (value) =>
    !isEmpty(value) && coerceArray(value).length > max
      ? messageWithDefault(
          message,
          `You must choose a maximum of ${max} option(s)`,
        )
      : undefined;

const uniqueArrayAttribute =
  (_: unknown, message: ValidationMessage): Validator =>
  (value, allValues, __, name) => {
    if (!value) {
      return undefined;
    }

    // expects `name` of format: `fieldName[n].attribute`
    const fieldName = (name as string).split('[')[0] ?? '';
    const attribute = (name as string).split('.')[1] ?? '';
    const instanceCount = (
      get(allValues, fieldName) as Record<string, unknown>[]
    ).reduce((count: number, option: Record<string, unknown>) => {
      const optionValue = option[attribute];

      if (isRoughlyEqual(optionValue, value)) {
        return count + 1;
      }
      return count;
    }, 0);

    if (instanceCount >= 2) {
      return messageWithDefault(
        message,
        `${capitalize(attribute)}s must be unique`,
      );
    }
    return undefined;
  };

const uniqueByList =
  (list: unknown[], message?: ValidationMessage): Validator =>
  (value) => {
    if (!value) {
      return undefined;
    }

    const existsAlready = list.some((existingValue: unknown) =>
      isRoughlyEqual(existingValue, value),
    );

    if (existsAlready) {
      return messageWithDefault(message, `"${value}" is already in use`);
    }

    return undefined;
  };

const ISODate =
  (dateFormat: string, message: ValidationMessage): Validator =>
  (value) => {
    const dt = DateTime.fromISO(value as string);
    if (
      (value && dateFormat.length !== (value as string).length) ||
      (value && !dt.isValid)
    ) {
      return messageWithDefault(
        message,
        `Date is not valid (${dateFormat.toUpperCase()})`,
      );
    }
    return undefined;
  };

const greaterThan =
  (fieldPath: string, message: ValidationMessage): Validator =>
  (value, allValues) => {
    if (!hasValue(value)) {
      return undefined;
    }
    const otherValue = get(allValues, fieldPath);
    if (!hasValue(otherValue)) {
      return undefined;
    }
    if ((value as number) <= (otherValue as number)) {
      return messageWithDefault(
        message,
        'Must be greater than the other field',
      );
    }
    return undefined;
  };

// Variables and option values must respect NMTOKEN rules so that
// they are compatable with XML export formats
const allowedVariableName =
  (name = 'variable name'): Validator =>
  (value) => {
    if (!/^[a-zA-Z0-9._\-:]+$/.test(value as string)) {
      return `Not a valid ${name}. Only letters, numbers and the symbols ._-: are supported`;
    }
    return undefined;
  };

const validRegExp =
  (_: unknown, message: ValidationMessage): Validator =>
  (value) => {
    try {
      const regexp = new RegExp(value as string);
      if (isRegExp(regexp)) {
        return undefined;
      }
      return messageWithDefault(message, 'Not a valid regular expression.');
    } catch (_e) {
      return messageWithDefault(message, 'Not a valid regular expression.');
    }
  };

export const validations = {
  greaterThan,
  ISODate,
  allowedVariableName,
  allowedNMToken: allowedVariableName,
  maxLength,
  maxSelected,
  maxValue,
  minLength,
  minSelected,
  minValue,
  positiveNumber,
  required,
  requiredAcceptsNull,
  requiredAcceptsZero,
  uniqueArrayAttribute,
  uniqueByList,
  validRegExp,
};

type ValidationOption = {
  value: unknown;
  message: string;
};

export const getValidations = (
  validationOptions: Record<string, unknown> = {},
): Validator[] =>
  map(toPairs(validationOptions), ([type, options]: [string, unknown]) => {
    if (typeof options === 'function') {
      return options as Validator;
    }
    const hasCustomMessage =
      options !== null &&
      typeof options === 'object' &&
      !Array.isArray(options) &&
      'message' in options;
    const args = hasCustomMessage
      ? [
          (options as ValidationOption).value,
          (options as ValidationOption).message,
        ]
      : [options];
    if (Object.hasOwn(validations, type)) {
      const factory = validations[
        type as keyof typeof validations
      ] as ValidationFactory;
      return factory(...(args as never[]));
    }
    return () => `Validation "${type}" not found`;
  });

export const getValidator = (validation: Record<string, unknown> = {}) => {
  const validators = getValidations(validation);

  return (value: ValidationValue) => {
    const errors = validators.reduce(
      (result: ValidationResult, validator: Validator) => {
        if (!validator(value) || result) {
          return result;
        }

        return validator(value);
      },
      undefined,
    );

    return errors;
  };
};
