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
  if (Array.isArray(value)) {
    return value;
  }
  if (value instanceof Object) {
    return Object.values(value);
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
  (value) => {
    if (!isRequired) {
      return undefined;
    }
    return isNil(value) ? messageWithDefault(message, 'Required') : undefined;
  };

const requiredAcceptsNull =
  (isRequired: boolean, message: ValidationMessage): Validator =>
  (value) => {
    if (!isRequired) {
      return undefined;
    }
    return isUndefined(value)
      ? messageWithDefault(message, 'Required')
      : undefined;
  };

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
    const fieldMatch = name?.match(/^(.*)\[\d+\]\.([^.[\]]+)$/);
    if (!fieldMatch) return undefined;

    const [, fieldName = '', attribute = ''] = fieldMatch;
    const arrayValue = get(allValues, fieldName);
    if (!Array.isArray(arrayValue)) return undefined;

    const instanceCount = arrayValue.reduce(
      (count: number, option: Record<string, unknown>) => {
        const optionValue = option[attribute];

        if (isRoughlyEqual(optionValue, value)) {
          return count + 1;
        }
        return count;
      },
      0,
    );

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
    if (!value) return undefined;

    const dt =
      typeof value === 'string'
        ? DateTime.fromISO(value)
        : DateTime.invalid('Date value must be a string');
    if (
      typeof value !== 'string' ||
      dateFormat.length !== value.length ||
      !dt.isValid
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

/**
 * Audit sweep: the equality-permitting sibling of `greaterThan`. The protocol
 * schema only rejects `min > max` on a DatePicker's bounds, so a collapsed
 * single-day window (`min === max`) is a legal configuration — and exactly the
 * shape the contradiction analyser reasons about when it pins such a variable
 * to one value. Gating the editor with `greaterThan` refused to author it.
 */
const greaterThanOrEqualTo =
  (fieldPath: string, message: ValidationMessage): Validator =>
  (value, allValues) => {
    if (!hasValue(value)) {
      return undefined;
    }
    const otherValue = get(allValues, fieldPath);
    if (!hasValue(otherValue)) {
      return undefined;
    }
    if ((value as number) < (otherValue as number)) {
      return messageWithDefault(
        message,
        'Must be greater than or equal to the other field',
      );
    }
    return undefined;
  };

/**
 * Audit sweep: a lower bound on an ISO date field. The protocol schema
 * requires a RelativeDatePicker `anchor` of 0100-01-01 or later — fresco-ui's
 * `addDays` runtime arithmetic builds `Date.UTC(year, ...)`, which two-digit-
 * coerces only a year in 0-99 onto 1900-1999, so a smaller year is the actual
 * hazard, not any year below 1000 (twenty-first-wave Finding 4, correcting an
 * over-aggressive 1000 floor) — and Architect had no matching editor rule: the
 * dialog saved and protocol validation then threw a blocking invalid-protocol
 * dialog offering to revert the edit. Bounds authored in the picker's
 * `parameters` configure its range, they do not validate the committed value.
 *
 * ISO dates written at one resolution order lexicographically, so comparing
 * the strings is exact — the paired `ISODate` rule has already rejected
 * anything not in `YYYY-MM-DD` form.
 */
const minDate =
  (min: string, message: ValidationMessage): Validator =>
  (value) =>
    typeof value === 'string' && value !== '' && value < min
      ? messageWithDefault(message, `Date must be ${min} or later`)
      : undefined;

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
  greaterThanOrEqualTo,
  ISODate,
  allowedVariableName,
  allowedNMToken: allowedVariableName,
  maxLength,
  maxSelected,
  maxValue,
  minDate,
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
        if (result) return result;
        return validator(value);
      },
      undefined,
    );

    return errors;
  };
};
