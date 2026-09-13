import { get } from 'es-toolkit/compat';

import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';

import BooleanVariable from '../images/variables/boolean-variable.svg';
import CategoricalVariable from '../images/variables/categorical-variable.svg';
import DateVariable from '../images/variables/date-variable.svg';
import DefaultVariable from '../images/variables/default-variable.svg';
import LayoutVariable from '../images/variables/layout-variable.svg';
import LocationVariable from '../images/variables/location-variable.svg';
import NumberVariable from '../images/variables/number-variable.svg';
import OrdinalVariable from '../images/variables/ordinal-variable.svg';
import ScalarVariable from '../images/variables/scalar-variable.svg';
import TextVariable from '../images/variables/text-variable.svg';

const configMessages = defineMessages({
  number: {
    id: 'architect.config.variables.config.number',
    defaultMessage: 'Number',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  text: {
    id: 'architect.config.variables.config.text',
    defaultMessage: 'Text',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  boolean: {
    id: 'architect.config.variables.config.boolean',
    defaultMessage: 'Boolean',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  ordinal: {
    id: 'architect.config.variables.config.ordinal',
    defaultMessage: 'Ordinal',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  categorical: {
    id: 'architect.config.variables.config.categorical',
    defaultMessage: 'Categorical',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  scalar: {
    id: 'architect.config.variables.config.scalar',
    defaultMessage: 'Scalar',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  date: {
    id: 'architect.config.variables.config.date',
    defaultMessage: 'Date',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  layout: {
    id: 'architect.config.variables.config.layout',
    defaultMessage: 'Layout',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
  location: {
    id: 'architect.config.variables.config.location',
    defaultMessage: 'Location',
    description:
      'Presentation label or description in config/variables.ts. Identifiers are not translated.',
  },
});

// TODO: This should be a monolithic object that contains all variable types
// and properties. All other derivations/permutations of this data should be
// merged into this object.
//
// For example: input components, if the variable has options or properties,
// etc. Then the required properties can be picked from this object using
// map/reduce/get etc.
export const VARIABLE_TYPES = {
  number: {
    label: configMessages.number,
    value: 'number',
    icon: NumberVariable,
    color: 'paradise-pink',
  },
  text: {
    label: configMessages.text,
    value: 'text',
    icon: TextVariable,
    color: 'cerulean-blue',
  },
  boolean: {
    label: configMessages.boolean,
    value: 'boolean',
    icon: BooleanVariable,
    color: 'neon-carrot',
  },
  ordinal: {
    label: configMessages.ordinal,
    value: 'ordinal',
    icon: OrdinalVariable,
    color: 'sea-green',
  },
  categorical: {
    label: configMessages.categorical,
    value: 'categorical',
    icon: CategoricalVariable,
    color: 'mustard',
  },
  scalar: {
    label: configMessages.scalar,
    value: 'scalar',
    icon: ScalarVariable,
    color: 'kiwi',
  },
  datetime: {
    label: configMessages.date,
    value: 'datetime',
    icon: DateVariable,
    color: 'tomato',
  },
  layout: {
    label: configMessages.layout,
    value: 'layout',
    icon: LayoutVariable,
    color: 'purple-pizazz',
  },
  location: {
    label: configMessages.location,
    value: 'location',
    icon: LocationVariable,
    color: 'slate-blue-dark',
  },
};

// Internal config - not exported
const VARIABLE_TYPES_WITH_OPTIONS = ['ordinal', 'categorical'];

/** Translate known attribute metadata without changing persisted type identifiers. */
export const getVariableTypeLabel = (
  type: string | undefined,
  intl: IntlShape,
): string => {
  const descriptor = Object.entries(VARIABLE_TYPES).find(
    ([key]) => key === type,
  )?.[1].label;
  return descriptor ? intl.formatMessage(descriptor) : (type ?? '');
};

export const VARIABLE_OPTIONS = Object.values(VARIABLE_TYPES);

const isOrdinalOrCategoricalType = (
  variableType: string | null | undefined,
): variableType is string =>
  typeof variableType === 'string' &&
  VARIABLE_TYPES_WITH_OPTIONS.includes(variableType);

const getColorForType = (type: string | undefined) =>
  get(VARIABLE_TYPES, [type ?? '', 'color'], 'charcoal');

const getIconForType = (type: string | undefined) =>
  get(VARIABLE_TYPES, `${type ?? ''}.icon`, DefaultVariable);

export { getColorForType, getIconForType, isOrdinalOrCategoricalType };
