import { startCase, without } from 'es-toolkit/compat';

import {
  VARIABLE_REFERENCE_VALIDATIONS,
  VARIABLE_TYPE_VALIDATIONS,
  type ValidationName,
} from '@codaco/protocol-validation';

// The Anonymisation stage's passphrase is not a codebook variable — its
// validation lives on the stage schema — so it has no entry in the shared
// per-variable-type record.
const PASSPHRASE_VALIDATIONS = [
  'minLength',
  'maxLength',
] as const satisfies readonly ValidationName[];

const isVariableType = (
  type: string,
): type is keyof typeof VARIABLE_TYPE_VALIDATIONS =>
  Object.hasOwn(VARIABLE_TYPE_VALIDATIONS, type);

const VALIDATIONS_WITH_NUMBER_VALUES = [
  'minLength',
  'maxLength',
  'minValue',
  'maxValue',
  'minSelected',
  'maxSelected',
];

const VALIDATIONS_WITHOUT_VALUES = ['required', 'unique'];

// Human-readable labels for each rule's row in the editor. Anything not listed
// here (there shouldn't be any) falls back to a start-cased version of the key.
const VALIDATION_LABELS: Partial<Record<ValidationName, string>> = {
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

/**
 * Widened to `string` because callers that read a rule name out of a committed
 * `validation` record (the rule-map validator, `validateRuleMap.ts`) hold an
 * unnarrowed key. `VALIDATION_LABELS` is read through a widened alias rather
 * than an assertion, so an unknown key falls through to the start-cased
 * fallback instead of being asserted into `ValidationName`.
 */
const getValidationLabel = (validation: string): string => {
  const labels: Record<string, string | undefined> = VALIDATION_LABELS;
  return labels[validation] ?? startCase(validation);
};

const isValidationWithoutValue = (validation: string): boolean =>
  VALIDATIONS_WITHOUT_VALUES.includes(validation);

const isValidationWithNumberValue = (validation: string): boolean =>
  VALIDATIONS_WITH_NUMBER_VALUES.includes(validation);
const isValidationWithListValue = (validation: string): boolean =>
  VARIABLE_REFERENCE_VALIDATIONS.some((key) => key === validation);

// Internal helper - not exported. Derived from the protocol schema's own
// per-type `validation` picks, so the editor can never offer a rule that
// would make the saved protocol fail validation.
const getValidationsForVariableType = (
  variableType: string,
): ValidationName[] => {
  if (variableType === 'passphrase') {
    return [...PASSPHRASE_VALIDATIONS];
  }

  if (!isVariableType(variableType)) {
    return [];
  }

  return Object.keys(
    VARIABLE_TYPE_VALIDATIONS[variableType],
  ) as ValidationName[];
};

const getValidationsForEntity = (
  validations: ValidationName[],
  entity: string,
): ValidationName[] =>
  entity === 'ego' ? without(validations, 'unique') : validations;

const getValidationOptionsForVariableType = (
  variableType: string,
  entity: string,
): ValidationOption[] =>
  getValidationsForEntity(
    getValidationsForVariableType(variableType),
    entity,
  ).map((validation) => ({
    label: getValidationLabel(validation),
    value: validation,
  }));

type ValidationOption = {
  label: string;
  value: ValidationName;
};

type ValidationGroupId = 'requirements' | 'limits' | 'comparisons';

type ValidationGroup = {
  id: ValidationGroupId;
  heading: string;
  rules: ValidationOption[];
};

const VALIDATION_GROUPS: readonly {
  id: ValidationGroupId;
  heading: string;
  includes: (validation: string) => boolean;
}[] = [
  {
    id: 'requirements',
    heading: 'Requirements',
    includes: isValidationWithoutValue,
  },
  { id: 'limits', heading: 'Limits', includes: isValidationWithNumberValue },
  {
    id: 'comparisons',
    heading: 'Compare to another attribute',
    includes: isValidationWithListValue,
  },
];

const groupsCache = new Map<string, ValidationGroup[]>();

const getGroupedValidationsForVariableType = (
  variableType: string,
  entity: string,
): ValidationGroup[] => {
  const cacheKey = `${variableType}:${entity}`;
  const cached = groupsCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const options = getValidationOptionsForVariableType(variableType, entity);

  const groups = VALIDATION_GROUPS.map(({ id, heading, includes }) => ({
    id,
    heading,
    rules: options.filter((option) => includes(option.value)),
  })).filter((group) => group.rules.length > 0);

  groupsCache.set(cacheKey, groups);

  return groups;
};

export type { ValidationGroup, ValidationOption };

export {
  getGroupedValidationsForVariableType,
  getValidationLabel,
  getValidationOptionsForVariableType,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
};
