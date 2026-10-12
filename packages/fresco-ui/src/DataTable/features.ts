import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_arrIncludes,
  filterFn_arrIncludesSome,
  filterFn_equals,
  filterFn_inDateRange,
  filterFn_includesString,
  filterFn_inNumberRange,
  filterFn_weakEquals,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  sortFn_textCaseSensitive,
  tableFeatures,
} from '@tanstack/react-table';

import type { FilterConfig } from './filters/types';

/**
 * Shape of `columnDef.meta` for every table built from `dataTableFeatures`.
 * `ColumnHeader` reads `filterType`/`filterConfig` to decide which filter UI
 * a column offers.
 */
export type DataTableColumnMeta = {
  filterType?: 'range' | 'date' | 'text' | 'boolean' | 'faceted' | 'operator';
  filterConfig?: FilterConfig;
  className?: string;
};

/**
 * The TanStack Table v9 feature set every `DataTable` component is built on.
 *
 * v9 only installs the APIs of registered features, and the table type is
 * invariant in its feature set, so the DataTable components (which read
 * sorting, filtering, pagination, selection and visibility APIs) all take a
 * `Table<DataTableFeatures, TData>`. Build any table that is rendered through
 * these components with `useTable({ features: dataTableFeatures, ... })`.
 *
 * Every client-side row model is registered. Tables whose rows arrive already
 * sorted, filtered or paginated opt out per table with `manualSorting`,
 * `manualFiltering` or `manualPagination`, which make the table skip the
 * matching row model exactly as leaving it unregistered did in v8.
 *
 * The filter and sort registries hold the built-ins that column definitions
 * name by string and that the `'auto'` resolution picks from (v9 resolves
 * names only against registered functions). Custom filter functions are
 * passed directly on column definitions and need no registration.
 */
export const dataTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    inNumberRange: filterFn_inNumberRange,
    inDateRange: filterFn_inDateRange,
    equals: filterFn_equals,
    weakEquals: filterFn_weakEquals,
    arrIncludes: filterFn_arrIncludes,
    arrIncludesSome: filterFn_arrIncludesSome,
  },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
    textCaseSensitive: sortFn_textCaseSensitive,
  },
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;
