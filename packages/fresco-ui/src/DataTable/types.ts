import type { ColumnDef, RowData, SortFnOption } from '@tanstack/react-table';

import type { DataTableFeatures } from './features';

export type Option = {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
};

/**
 * A column definition for a table built from `dataTableFeatures`.
 */
export type DataTableColumnDef<
  TData extends RowData,
  TValue = unknown,
> = ColumnDef<DataTableFeatures, TData, TValue>;

/**
 * A stricter `DataTableColumnDef` that requires `sortFn` on every sortable
 * column. Columns that set `enableSorting: false` are exempt.
 */
export type StrictColumnDef<TData extends RowData, TValue = unknown> =
  | (DataTableColumnDef<TData, TValue> & { enableSorting: false })
  | (DataTableColumnDef<TData, TValue> & {
      sortFn: SortFnOption<DataTableFeatures, TData>;
    });

export type DataTableSearchableColumn<TData> = {
  id: keyof TData | (string & {});
  title: string;
};

export type DataTableFilterableColumn<TData> = {
  options: Option[];
} & DataTableSearchableColumn<TData>;

export const pageSizes = [10, 25, 50, 100] as const;
