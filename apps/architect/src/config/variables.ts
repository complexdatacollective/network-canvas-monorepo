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
      'Name of the number attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  text: {
    id: 'architect.config.variables.config.text',
    defaultMessage: 'Text',
    description:
      'Name of the text attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  boolean: {
    id: 'architect.config.variables.config.boolean',
    defaultMessage: 'Boolean',
    description:
      'Name of the boolean attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  ordinal: {
    id: 'architect.config.variables.config.ordinal',
    defaultMessage: 'Ordinal',
    description:
      'Name of the ordinal attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  categorical: {
    id: 'architect.config.variables.config.categorical',
    defaultMessage: 'Categorical',
    description:
      'Name of the categorical attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  scalar: {
    id: 'architect.config.variables.config.scalar',
    defaultMessage: 'Scalar',
    description:
      'Name of the scalar attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  date: {
    id: 'architect.config.variables.config.date',
    defaultMessage: 'Date',
    description:
      'Name of the date attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  layout: {
    id: 'architect.config.variables.config.layout',
    defaultMessage: 'Layout',
    description:
      'Name of the layout attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
  },
  location: {
    id: 'architect.config.variables.config.location',
    defaultMessage: 'Location',
    description:
      'Name of the location attribute (codebook variable) type, shown in the attribute type picker and read aloud in icon alt text.',
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
