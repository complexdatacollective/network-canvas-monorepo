import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';

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
  },
  text: {
    label: configMessages.text,
    value: 'text',
  },
  boolean: {
    label: configMessages.boolean,
    value: 'boolean',
  },
  ordinal: {
    label: configMessages.ordinal,
    value: 'ordinal',
  },
  categorical: {
    label: configMessages.categorical,
    value: 'categorical',
  },
  scalar: {
    label: configMessages.scalar,
    value: 'scalar',
  },
  datetime: {
    label: configMessages.date,
    value: 'datetime',
  },
  layout: {
    label: configMessages.layout,
    value: 'layout',
  },
  location: {
    label: configMessages.location,
    value: 'location',
  },
};

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
