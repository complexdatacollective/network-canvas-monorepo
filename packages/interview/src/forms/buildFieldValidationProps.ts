import { invariant } from 'es-toolkit';

import type { ValidationPropsCatalogue } from '@codaco/fresco-ui/form/Field/types';
import type { Variable } from '@codaco/protocol-validation';

type ValidatedField = {
  type: Variable['type'];
  variable: string;
  validation?: Record<string, unknown>;
};

/**
 * Read a rule off the protocol's untyped validation object, asserting its
 * type rather than casting it. A malformed value cannot survive schema
 * validation, so reaching one of these invariants means the protocol
 * bypassed the schema — fail loudly and name the culprit rather than feeding
 * a bad parameter to a validator that would report a generic
 * "An error occurred while validating."
 */
function readRule<T>(
  validation: Record<string, unknown>,
  key: string,
  variable: string,
  expected: string,
  isValid: (value: unknown) => value is T,
): T | undefined {
  const value = validation[key];
  if (value === undefined) return undefined;
  invariant(
    isValid(value),
    `Variable "${variable}" declares a "${key}" validation of ${typeof value}, but ${expected} is required.`,
  );
  return value;
}

const isBoolean = (value: unknown): value is boolean =>
  typeof value === 'boolean';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isPattern = (
  value: unknown,
): value is ValidationPropsCatalogue['pattern'] =>
  typeof value === 'object' && value !== null && 'regex' in value;

/**
 * Map a codebook variable's validation object onto Field validation props.
 * Extracted from useProtocolForm so the synthetic-data conformance test can
 * assert against exactly the props the interview renders with.
 */
export function buildFieldValidationProps(
  field: ValidatedField,
): Partial<ValidationPropsCatalogue> {
  const props: Partial<ValidationPropsCatalogue> = {};
  const validation = field.validation;
  if (!validation) return props;

  const { variable } = field;
  const bool = (key: string) =>
    readRule(validation, key, variable, 'a boolean', isBoolean);
  const num = (key: string) =>
    readRule(validation, key, variable, 'a number', isNumber);
  const ref = (key: string) =>
    readRule(validation, key, variable, 'a variable id', isString);

  const required = bool('required');
  if (required !== undefined) props.required = required;

  for (const key of [
    'minLength',
    'maxLength',
    'minValue',
    'maxValue',
    'minSelected',
    'maxSelected',
  ] as const) {
    const value = num(key);
    if (value !== undefined) props[key] = value;
  }

  const pattern = readRule(
    validation,
    'pattern',
    variable,
    'an object with a regex',
    isPattern,
  );
  if (pattern !== undefined) props.pattern = pattern;

  // The protocol stores `unique` as a boolean, but the validator needs the
  // attribute name to collect other entities' values.
  if (bool('unique') === true) props.unique = variable;

  const differentFrom = ref('differentFrom');
  if (differentFrom !== undefined) props.differentFrom = differentFrom;

  const sameAs = ref('sameAs');
  if (sameAs !== undefined) props.sameAs = sameAs;

  for (const key of [
    'greaterThanVariable',
    'lessThanVariable',
    'greaterThanOrEqualToVariable',
    'lessThanOrEqualToVariable',
  ] as const) {
    const attribute = ref(key);
    if (attribute !== undefined) props[key] = { attribute, type: field.type };
  }

  return props;
}
