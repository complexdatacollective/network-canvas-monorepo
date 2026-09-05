import { without } from 'es-toolkit/compat';

import {
  createAppIntl,
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import {
  VARIABLE_REFERENCE_VALIDATIONS,
  VARIABLE_TYPE_VALIDATIONS,
  type ValidationName,
} from '@codaco/protocol-validation';
import {
  formatValidationRule,
  validationRuleMessages,
} from '@codaco/protocol-validation/messages';
const groupMessages = defineMessages({
  requirements: {
    id: 'architect.validation.group.requirements',
    defaultMessage: 'Requirements',
    description: 'Group heading for related validation rules.',
  },
  limits: {
    id: 'architect.validation.group.limits',
    defaultMessage: 'Limits',
    description: 'Group heading for related validation rules.',
  },
  comparisons: {
    id: 'architect.validation.group.comparisons',
    defaultMessage: 'Compare to another attribute',
    description: 'Group heading for related validation rules.',
  },
});

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

const defaultIntl = createAppIntl({ locale: 'en' });

/**
 * Widened to `string` because callers that read a rule name out of a committed
 * `validation` record (the rule-map validator, `validateRuleMap.ts`) hold an
 * unnarrowed key. `VALIDATION_LABELS` is read through a widened alias rather
 * than an assertion, so an unknown key falls through to the start-cased
 * fallback instead of being asserted into `ValidationName`.
 */
export const getValidationDescriptor = (
  validation: string,
): MessageDescriptor | undefined =>
  Object.entries(validationRuleMessages).find(
    ([key]) => key === validation,
  )?.[1];
const getValidationLabel = (
  validation: string,
  intl: IntlShape = defaultIntl,
): string => formatValidationRule(validation, intl);

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
  intl: IntlShape = defaultIntl,
): ValidationOption[] =>
  getValidationsForEntity(
    getValidationsForVariableType(variableType),
    entity,
  ).map((validation) => ({
    label: getValidationLabel(validation, intl),
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
  heading: MessageDescriptor;
  includes: (validation: string) => boolean;
}[] = [
  {
    id: 'requirements',
    heading: groupMessages.requirements,
    includes: isValidationWithoutValue,
  },
  {
    id: 'limits',
    heading: groupMessages.limits,
    includes: isValidationWithNumberValue,
  },
  {
    id: 'comparisons',
    heading: groupMessages.comparisons,
    includes: isValidationWithListValue,
  },
];

const getGroupedValidationsForVariableType = (
  variableType: string,
  entity: string,
  intl: IntlShape = defaultIntl,
): ValidationGroup[] => {
  const options = getValidationOptionsForVariableType(
    variableType,
    entity,
    intl,
  );

  const groups = VALIDATION_GROUPS.map(({ id, heading, includes }) => ({
    id,
    heading: intl.formatMessage(heading),
    rules: options.filter((option) => includes(option.value)),
  })).filter((group) => group.rules.length > 0);

  return groups;
};

export type { ValidationGroup, ValidationOption };

export {
  getGroupedValidationsForVariableType,
  getValidationOptionsForVariableType,
  isValidationWithListValue,
  isValidationWithNumberValue,
  isValidationWithoutValue,
};
