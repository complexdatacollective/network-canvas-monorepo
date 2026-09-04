'use client';

import { type Column } from '@tanstack/react-table';
import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import ComboboxField from '../form/fields/Combobox/Combobox';
import { type ComboboxOption } from '../form/fields/Combobox/shared';
import { type Option } from './types';

const messages = defineMessages({
  filterPlaceholder: {
    id: 'frescoUi.dataTableFacetedFilter.placeholder',
    defaultMessage: 'Filter {title}...',
    description:
      'Placeholder of the faceted column filter; {title} is the host-supplied column heading.',
  },
  searchPlaceholder: {
    id: 'frescoUi.dataTableFacetedFilter.searchPlaceholder',
    defaultMessage: 'Search {title}...',
    description:
      'Placeholder of the search box inside the faceted column filter; {title} is the host-supplied column heading.',
  },
  noOptions: {
    id: 'frescoUi.dataTableFacetedFilter.noOptions',
    defaultMessage: 'No {title} found.',
    description:
      'Empty state of the faceted column filter; {title} is the host-supplied column heading.',
  },
});

type DataTableFacetedFilterProps<TData, TValue> = {
  column?: Column<TData, TValue>;
  title?: string;
  options: Option[];
  className?: string;
};

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
  options,
  className,
}: DataTableFacetedFilterProps<TData, TValue>) {
  // TanStack Table returns a mutable ref with stable identity, defeating React Compiler memoization.
  'use no memo';
  const intl = useAppIntl();
  const selectedValues = (column?.getFilterValue() as string[]) ?? [];
  // An absent title interpolates as empty rather than as the word "undefined",
  // which is what template-literal assembly used to produce.
  const columnTitle = title ?? '';

  const comboboxOptions: ComboboxOption[] = useMemo(
    () =>
      options.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    [options],
  );

  const handleChange = (newValues: (string | number)[] | undefined) => {
    if (!newValues || newValues.length === 0) {
      column?.setFilterValue(undefined);
    } else {
      column?.setFilterValue(newValues);
    }
  };

  return (
    <ComboboxField
      name={`filter-${title}`}
      options={comboboxOptions}
      placeholder={intl.formatMessage(messages.filterPlaceholder, {
        title: columnTitle,
      })}
      searchPlaceholder={intl.formatMessage(messages.searchPlaceholder, {
        title: columnTitle,
      })}
      // The column heading goes in verbatim: lower-casing it (as this did) is
      // not a transformation every language can make.
      emptyMessage={intl.formatMessage(messages.noOptions, {
        title: columnTitle,
      })}
      value={selectedValues}
      onChange={handleChange}
      showSelectAll
      showDeselectAll
      className={className}
    />
  );
}
