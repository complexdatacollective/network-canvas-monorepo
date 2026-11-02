'use client';

import {
  type Column,
  flexRender,
  type Row,
  type RowData,
  type Table as TTable,
} from '@tanstack/react-table';
import { type ReactNode, useEffect } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../Table';
import { cx } from '../utils/cva';
import { messages as floatingBarMessages } from './DataTableFloatingBar';
import { DataTablePagination } from './DataTablePagination';
import { type DataTableFeatures } from './features';

function getColumnHighlight<TData extends RowData>(
  column: Column<DataTableFeatures, TData>,
) {
  const isSorted = column.getIsSorted();
  const isFiltered = column.getIsFiltered();
  if (isSorted && isFiltered)
    return 'bg-[color-mix(in_oklab,oklch(var(--sea-green))_5%,var(--selected)_5%)]';
  if (isSorted)
    return 'bg-[color-mix(in_oklab,oklch(var(--sea-green))_5%,transparent)]';
  if (isFiltered)
    return 'bg-[color-mix(in_oklab,var(--selected)_5%,transparent)]';
  return undefined;
}

const messages = defineMessages({
  noResults: {
    id: 'frescoUi.dataTable.noResults',
    defaultMessage: 'No results.',
    description: 'Default empty state shown when a table has no rows.',
  },
});

/**
 * A data table should say what it holds: either a string, or the id of a
 * heading already on the page, not both. Optional in the type so that adding
 * the contract was not a breaking change for existing callers; rendering one
 * without a name warns in development.
 */
type DataTableName =
  | { 'aria-label'?: string; 'aria-labelledby'?: never }
  | { 'aria-labelledby'?: string; 'aria-label'?: never };

const ariaSortValues = {
  asc: 'ascending',
  desc: 'descending',
} as const;

type DataTableProps<TData extends RowData> = DataTableName & {
  table: TTable<DataTableFeatures, TData>;
  toolbar?: ReactNode;
  floatingBar?: ReactNode;
  showPagination?: boolean;
  emptyText?: string;
  getRowClasses?: (row: Row<DataTableFeatures, TData>) => string | undefined;
  bodyScroll?: boolean;
  /**
   * How many rows are selected, announced as it changes. Only for a table whose
   * selection is not kept in the table's own `rowSelection` state: a selection
   * that spans pages that were never fetched ("all matching") cannot be a set
   * of row ids. Leave it out when `rowSelection` holds the selection.
   */
  selectedCount?: number;
};

export function DataTable<TData extends RowData>({
  table,
  toolbar,
  floatingBar,
  showPagination = true,
  emptyText,
  getRowClasses,
  bodyScroll = false,
  selectedCount: selectedCountOverride,
  ...name
}: DataTableProps<TData>) {
  // TanStack Table returns a mutable ref with stable identity, defeating React Compiler memoization.
  'use no memo';
  const intl = useAppIntl();
  const columnCount = table.getAllColumns().length;
  const resolvedEmptyText = emptyText ?? intl.formatMessage(messages.noResults);
  // Counted from the selection state rather than the rendered rows, so that
  // rows selected on other pages (or beyond a server-paginated page) count.
  const selectedCount =
    selectedCountOverride ??
    Object.values(table.atoms.rowSelection.get()).filter(Boolean).length;
  const isNamed = !!name['aria-label'] || !!name['aria-labelledby'];

  useEffect(() => {
    // Consumer bundlers replace this Vite environment flag, so the warning
    // is dead-code-eliminated from production builds.
    if (import.meta.env.DEV && !isNamed) {
      // oxlint-disable-next-line no-console -- dev-only warning for a missing accessible name, dead-code-eliminated from production builds by the DEV guard above
      console.warn(
        'DataTable: no accessible name. Pass `aria-label` or `aria-labelledby` so screen readers can say what the table holds.',
      );
    }
  }, [isNamed]);

  return (
    <div className={cx('flex flex-col gap-6', bodyScroll && 'h-full min-h-0')}>
      {toolbar}
      {/* Rows are not `aria-selected`: that state is only valid on the rows of
          a `grid`, and this is a `table` whose selection lives in each row's
          checkbox. The checkbox says which row; this says how many, and is
          announced as the selection changes. */}
      <output className="sr-only">
        {selectedCount > 0
          ? intl.formatMessage(floatingBarMessages.rowsSelected, {
              count: selectedCount,
            })
          : ''}
      </output>
      <Table bodyScroll={bodyScroll} {...name}>
        <TableHeader className={cx(bodyScroll && 'sticky top-0 z-10')}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    scope="col"
                    // On the cell, not the button inside it: the sort state is a
                    // property of the column header.
                    aria-sort={
                      header.column.getCanSort()
                        ? sorted
                          ? ariaSortValues[sorted]
                          : 'none'
                        : undefined
                    }
                    className={cx(getColumnHighlight(header.column))}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && 'selected'}
                className={getRowClasses?.(row)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cx(getColumnHighlight(cell.column))}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-24 text-center">
                {resolvedEmptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {showPagination && <DataTablePagination table={table} />}
      {floatingBar}
    </div>
  );
}
