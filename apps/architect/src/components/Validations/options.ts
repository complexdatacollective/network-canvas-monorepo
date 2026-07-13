import { get, startCase, without } from 'es-toolkit/compat';

import { VARIABLE_REFERENCE_VALIDATIONS } from '@codaco/protocol-validation';

const VALIDATIONS = {
  text: [
    'required',
    'minLength',
    'maxLength',
    'unique',
    'differentFrom',
    'sameAs',
  ],
  number: [
    'required',
    'minValue',
    'maxValue',
    'unique',
    'differentFrom',
    'sameAs',
    'lessThanVariable',
    'greaterThanVariable',
    'lessThanOrEqualToVariable',
    'greaterThanOrEqualToVariable',
  ],
  datetime: [
    'required',
    'unique',
    'differentFrom',
    'sameAs',
    'lessThanVariable',
    'greaterThanVariable',
    'lessThanOrEqualToVariable',
    'greaterThanOrEqualToVariable',
  ],
  scalar: [
    'required',
    'unique',
    'differentFrom',
    'sameAs',
    'lessThanVariable',
    'greaterThanVariable',
    'lessThanOrEqualToVariable',
    'greaterThanOrEqualToVariable',
  ],
  boolean: ['required', 'unique', 'differentFrom', 'sameAs'],
  ordinal: ['required', 'unique', 'differentFrom', 'sameAs'],
  categorical: [
    'required',
    'minSelected',
    'maxSelected',
    'unique',
    'differentFrom',
    'sameAs',
  ],
  passphrase: ['minLength', 'maxLength'],
};

const VALIDATIONS_WITH_NUMBER_VALUES = [
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
];

const VALIDATIONS_WITHOUT_VALUES = ['required', 'unique'];

// Human-readable labels for the "Select validation rule" dropdown and for the
// collapsed-row summary text. Anything not listed here (there shouldn't be
// any) falls back to a start-cased version of the key.
const VALIDATION_LABELS: Record<string, string> = {
  required: 'Required',
  unique: 'Must be unique',
  minLength: 'Minimum length',
  maxLength: 'Maximum length',
  minValue: 'Minimum value',
  maxValue: 'Maximum value',
  minSelected: 'Minimum selected',
  maxSelected: 'Maximum selected',
  differentFrom: 'Different from',
  sameAs: 'Same as',
  lessThanVariable: 'Less than',
  greaterThanVariable: 'Greater than',
  lessThanOrEqualToVariable: 'Less than or equal to',
  greaterThanOrEqualToVariable: 'Greater than or equal to',
};

const getValidationLabel = (validation: string): string =>
  VALIDATION_LABELS[validation] ?? startCase(validation);

const isValidationWithoutValue = (validation: string): boolean =>
  VALIDATIONS_WITHOUT_VALUES.includes(validation);

const isValidationWithNumberValue = (validation: string): boolean =>
  VALIDATIONS_WITH_NUMBER_VALUES.includes(validation);
const isValidationWithListValue = (validation: string): boolean =>
  VARIABLE_REFERENCE_VALIDATIONS.some((key) => key === validation);

// Internal helper - not exported
const getValidationsForVariableType = (variableType: string): string[] =>
  get(VALIDATIONS, variableType, []) as string[];

const getValidationsForEntity = (
  validations: string[],
  entity: string,
): string[] =>
  entity === 'ego' ? without(validations, 'unique') : validations;

const getValidationOptionsForVariableType = (
  variableType: string,
  entity: string,
) =>
  getValidationsForEntity(
    getValidationsForVariableType(variableType),
    entity,
  ).map((validation) => ({
    label: getValidationLabel(validation),
    value: validation,
  }));

export {
  getValidationLabel,
  getValidationOptionsForVariableType,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
};
