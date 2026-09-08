import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
const sortMessages = defineMessages({
  descending: {
    id: 'architect.sortOptions.attribute.descending',
    defaultMessage: 'Descending',
    description: 'Researcher-facing Architect control or feedback.',
  },
  ascending: {
    id: 'architect.sortOptions.attribute.ascending',
    defaultMessage: 'Ascending',
    description: 'Researcher-facing Architect control or feedback.',
  },
});
const defaultIntl = createAppIntl({ locale: 'en' });
type VariableOption = {
  value: string;
  label: string;
  type?: string;
};

type OptionProperties = {
  value: string;
  label: string;
  disabled?: boolean;
};

const NON_SORTABLE_TYPES = ['layout'];
const getOptionProperties = (option: VariableOption): OptionProperties => ({
  value: option.value,
  label: option.label,
});

// `allValues` is the array field's own value, so it is undefined until the
// field holds rows, and a partially-filled row has no `property` yet.
const hasSortProperty = (row: unknown): row is { property: string } =>
  typeof row === 'object' &&
  row !== null &&
  'property' in row &&
  typeof row.property === 'string';

/**
 * Creates a optionGetter function for <MultiSelect />
 *
 * This optionGetter is for sortOrder, which defines properties for `property` and `direction`
 * columns.
 */
const getSortOrderOptionGetter =
  (variableOptions: VariableOption[], intl: IntlShape = defaultIntl) =>
  (property: string, _rowValues: unknown, allValues: unknown) => {
    switch (property) {
      case 'property': {
        const used = Array.isArray(allValues)
          ? allValues.filter(hasSortProperty).map((row) => row.property)
          : [];

        return [{ value: '*', label: '*' }, ...variableOptions]
          .filter((option) => !NON_SORTABLE_TYPES.includes(option.type ?? ''))
          .map((option) =>
            !used.includes(option.value)
              ? getOptionProperties(option)
              : { ...getOptionProperties(option), disabled: true },
          );
      }
      case 'direction':
        return [
          { value: 'desc', label: intl.formatMessage(sortMessages.descending) },
          { value: 'asc', label: intl.formatMessage(sortMessages.ascending) },
        ];
      default:
        return [];
    }
  };

export { getSortOrderOptionGetter };
