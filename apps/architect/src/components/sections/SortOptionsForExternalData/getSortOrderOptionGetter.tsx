import {
  createAppIntl,
  defineMessages,
  type IntlShape,
} from '@codaco/app-i18n/messages';
const defaultIntl = createAppIntl({ locale: 'en' });
import { map } from 'es-toolkit/compat';
const sortMessages = defineMessages({
  descending: {
    id: 'architect.sortOptions.external.descending',
    defaultMessage: 'Descending',
    description: 'Researcher-facing Architect control or feedback.',
  },
  ascending: {
    id: 'architect.sortOptions.external.ascending',
    defaultMessage: 'Ascending',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

const NON_SORTABLE_TYPES = ['layout'];

type ExternalDataPropertyOption = {
  value: string;
  label: string;
  type?: string;
};

/**
 * Creates a optionGetter function for <MultiSelect />
 *
 * This optionGetter is for sortOrder, which defines properties for `property` and `direction`
 * columns.
 */
const getSortOrderOptionGetter =
  (
    externalDataPropertyOptions: ExternalDataPropertyOption[],
    intl: IntlShape = defaultIntl,
  ) =>
  (property: string, _rowValues: unknown, allValues: unknown) => {
    switch (property) {
      case 'property': {
        const used = map(
          allValues as Record<string, unknown>[],
          'property',
        ) as string[];

        return [{ value: '*', label: '*' }, ...externalDataPropertyOptions]
          .filter((option) => !NON_SORTABLE_TYPES.includes(option.value))
          .map((option) =>
            !used.includes(option.value)
              ? option
              : { ...option, disabled: true },
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

export default getSortOrderOptionGetter;
