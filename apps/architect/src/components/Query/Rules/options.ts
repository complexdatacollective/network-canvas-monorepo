/* eslint-disable import/prefer-default-export */
import { omit } from 'es-toolkit/compat';

import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';

import { VARIABLE_TYPES } from '../../../config/variables';
const operatorMessages = defineMessages({
  EXACTLY: {
    id: 'architect.query.operator.exactly',
    defaultMessage: 'is exactly',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  EXISTS: {
    id: 'architect.query.operator.exists',
    defaultMessage: 'exists',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  NOT_EXISTS: {
    id: 'architect.query.operator.notExists',
    defaultMessage: 'does not exist',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  NOT: {
    id: 'architect.query.operator.not',
    defaultMessage: 'is not',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  GREATER_THAN: {
    id: 'architect.query.operator.greaterThan',
    defaultMessage: 'is greater than',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  GREATER_THAN_OR_EQUAL: {
    id: 'architect.query.operator.greaterThanOrEqual',
    defaultMessage: 'is greater than or exactly',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  LESS_THAN: {
    id: 'architect.query.operator.lessThan',
    defaultMessage: 'is less than',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  LESS_THAN_OR_EQUAL: {
    id: 'architect.query.operator.lessThanOrEqual',
    defaultMessage: 'is less than or exactly',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  CONTAINS: {
    id: 'architect.query.operator.contains',
    defaultMessage: 'contains',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  DOES_NOT_CONTAIN: {
    id: 'architect.query.operator.doesNotContain',
    defaultMessage: 'does not contain',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  INCLUDES: {
    id: 'architect.query.operator.includes',
    defaultMessage: 'includes',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  EXCLUDES: {
    id: 'architect.query.operator.excludes',
    defaultMessage: 'excludes',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  OPTIONS_GREATER_THAN: {
    id: 'architect.query.operator.optionsGreaterThan',
    defaultMessage: 'number of selected options is greater than',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  OPTIONS_LESS_THAN: {
    id: 'architect.query.operator.optionsLessThan',
    defaultMessage: 'number of selected options is less than',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  OPTIONS_EQUALS: {
    id: 'architect.query.operator.optionsEquals',
    defaultMessage: 'number of selected options is exactly',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
  OPTIONS_NOT_EQUALS: {
    id: 'architect.query.operator.optionsNotEquals',
    defaultMessage: 'number of selected options is not',
    description:
      'Operator label in the network filter and skip logic rule editor.',
  },
});

// Variable types that can't be used in rules
const disallowedVariableTypes: string[] = [];

export const validTypes = new Set(
  Object.keys(omit(VARIABLE_TYPES, disallowedVariableTypes)),
);

// List of operators (internal use only)
const operators = {
  EXACTLY: 'EXACTLY',
  EXISTS: 'EXISTS',
  INCLUDES: 'INCLUDES',
  EXCLUDES: 'EXCLUDES',
  CONTAINS: 'CONTAINS',
  DOES_NOT_CONTAIN: 'DOES_NOT_CONTAIN',
  NOT_EXISTS: 'NOT_EXISTS',
  NOT: 'NOT',
  GREATER_THAN: 'GREATER_THAN',
  GREATER_THAN_OR_EQUAL: 'GREATER_THAN_OR_EQUAL',
  LESS_THAN: 'LESS_THAN',
  LESS_THAN_OR_EQUAL: 'LESS_THAN_OR_EQUAL',
  OPTIONS_GREATER_THAN: 'OPTIONS_GREATER_THAN',
  OPTIONS_LESS_THAN: 'OPTIONS_LESS_THAN',
  OPTIONS_EQUALS: 'OPTIONS_EQUALS',
  OPTIONS_NOT_EQUALS: 'OPTIONS_NOT_EQUALS',
};

// List of operator options with labels

const defaultIntl = createAppIntl({ locale: 'en' });

export const getOperatorsAsOptions = (intl: IntlShape = defaultIntl) =>
  Object.entries(operatorMessages).map(([value, message]) => ({
    value,
    label: intl.formatMessage(message),
  }));

// Operators that also require a value to be used
export const operatorsWithValue = new Set([
  operators.EXACTLY,
  operators.NOT,
  operators.GREATER_THAN,
  operators.GREATER_THAN_OR_EQUAL,
  operators.LESS_THAN,
  operators.LESS_THAN_OR_EQUAL,
  operators.INCLUDES,
  operators.EXCLUDES,
]);

export const operatorsWithRegExp = new Set([
  operators.CONTAINS,
  operators.DOES_NOT_CONTAIN,
]);

// Operators that also require a count of options
export const operatorsWithOptionCount = new Set([
  operators.OPTIONS_GREATER_THAN,
  operators.OPTIONS_LESS_THAN,
  operators.OPTIONS_EQUALS,
  operators.OPTIONS_NOT_EQUALS,
]);

const numericOperators = [
  'EXACTLY',
  'NOT',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
];

export const operatorsByType = {
  text: new Set(['EXACTLY', 'NOT', 'CONTAINS', 'DOES_NOT_CONTAIN']),
  number: new Set(numericOperators),
  scalar: new Set(numericOperators),
  datetime: new Set(numericOperators),
  boolean: new Set(['EXACTLY', 'NOT']),
  location: new Set(['EXACTLY', 'NOT']),
  layout: new Set(['EXACTLY', 'NOT']),
  ordinal: new Set(['EXACTLY', 'NOT', 'INCLUDES', 'EXCLUDES']),
  categorical: new Set([
    'EXACTLY',
    'NOT',
    'INCLUDES',
    'EXCLUDES',
    'OPTIONS_GREATER_THAN',
    'OPTIONS_LESS_THAN',
    'OPTIONS_EQUALS',
    'OPTIONS_NOT_EQUALS',
  ]),
  exists: new Set(['EXISTS', 'NOT_EXISTS']),
};
