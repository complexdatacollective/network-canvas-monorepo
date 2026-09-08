'use client';
import { parseAsArrayOf, parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ComboboxField from '@codaco/fresco-ui/form/fields/Combobox/Combobox';

import { nuqsTableUrlKey, useNuqsTable } from './NuqsTableProvider';

type NuqsFacetedFilterProps<T extends string> = {
  /** Logical param name (unprefixed). The provider's `prefix` will be applied. */
  paramKey: string;
  /** Whitelist of values this filter accepts. Used for URL parsing + options. */
  values: readonly T[];
  /** Visible label for each option. Defaults to the value itself. */
  getLabel?: (value: T) => string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
};

/**
 * URL-backed multi-select filter for server-fetched tables.
 *
 * Values are parsed via `parseAsStringLiteral(values)` so unknown URL values
 * are rejected. Writes go through the provider's `startTransition`, so the
 * table body fades concurrently without unmounting.
 */
export default function NuqsFacetedFilter<T extends string>({
  paramKey,
  values,
  getLabel = (v) => v,
  placeholder: placeholderProp,
  searchPlaceholder: searchPlaceholderProp,
  emptyMessage: emptyMessageProp,
  className,
}: NuqsFacetedFilterProps<T>) {
  const intl = useAppIntl();
  const placeholder =
    placeholderProp ??
    intl.formatMessage(messages.NuqsFacetedFilterplaceholder);
  const searchPlaceholder =
    searchPlaceholderProp ??
    intl.formatMessage(messages.NuqsFacetedFiltersearchPlaceholder);
  const emptyMessage =
    emptyMessageProp ??
    intl.formatMessage(messages.NuqsFacetedFilteremptyMessage);
  const { prefix, startTransition } = useNuqsTable();
  const urlKey = nuqsTableUrlKey(prefix, paramKey);

  const [selected, setSelected] = useQueryState(
    urlKey,
    parseAsArrayOf(parseAsStringLiteral(values)).withOptions({
      shallow: false,
      clearOnDefault: true,
      startTransition,
    }),
  );

  const options = useMemo(
    () => values.map((v) => ({ value: v, label: getLabel(v) })),
    [values, getLabel],
  );

  return (
    <ComboboxField
      name={urlKey}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      value={selected ?? []}
      onChange={(newValues) => {
        const next = (newValues as T[] | undefined) ?? [];
        void setSelected(next.length > 0 ? next : null);
      }}
      showSelectAll
      showDeselectAll
      className={className ?? 'w-auto shrink-0'}
    />
  );
}

const messages = defineMessages({
  NuqsFacetedFilteremptyMessage: {
    id: 'fresco.tableFilters.NuqsFacetedFilteremptyMessage',
    defaultMessage: 'No options found.',
    description: 'Researcher-facing tableFilters: No options found.',
  },

  NuqsFacetedFiltersearchPlaceholder: {
    id: 'fresco.tableFilters.NuqsFacetedFiltersearchPlaceholder',
    defaultMessage: 'Search...',
    description: 'Researcher-facing tableFilters: Search...',
  },

  NuqsFacetedFilterplaceholder: {
    id: 'fresco.tableFilters.NuqsFacetedFilterplaceholder',
    defaultMessage: 'Filter...',
    description: 'Researcher-facing tableFilters: Filter...',
  },
});
