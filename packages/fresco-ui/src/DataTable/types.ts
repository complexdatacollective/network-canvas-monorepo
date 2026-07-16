import { type ColumnDef } from '@tanstack/react-table';

// Type-only side-effect import (erased entirely, so it never reaches Vite's
// runtime resolver) so the `ColumnMeta` module augmentation reaches every
// consumer of this file (directly or transitively, e.g. `ColumnHeader.tsx`
// via `filters/types.ts`) — see the comment in ./tanstack-table.d.ts for why
// this can't just rely on fresco-ui's own tsconfig `include`.
import type * as _tanstackTable from './tanstack-table';

export type Option = {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
};

/**
 * A stricter `ColumnDef` that requires `sortingFn` on every sortable column.
 * Columns that set `enableSorting: false` are exempt.
 */
export type StrictColumnDef<TData, TValue = unknown> =
  | (ColumnDef<TData, TValue> & { enableSorting: false })
  | (ColumnDef<TData, TValue> & {
      sortingFn: NonNullable<ColumnDef<TData, TValue>['sortingFn']>;
    });

export type DataTableSearchableColumn<TData> = {
  id: keyof TData | (string & {});
  title: string;
};

export type DataTableFilterableColumn<TData> = {
  options: Option[];
} & DataTableSearchableColumn<TData>;

export const pageSizes = [10, 25, 50, 100] as const;
