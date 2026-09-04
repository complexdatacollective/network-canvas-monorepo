import { type Table } from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { IconButton } from '../Button';
import SelectField from '../form/fields/Select/Native';
import Paragraph from '../typography/Paragraph';
import { pageSizes } from './types';

const messages = defineMessages({
  rowsPerPage: {
    id: 'frescoUi.dataTablePagination.rowsPerPage',
    defaultMessage: 'Rows per page',
    description: 'Label for the table page-size selector.',
  },
  pageOf: {
    id: 'frescoUi.dataTablePagination.pageOf',
    defaultMessage: 'Page {page} of {pageCount}',
    description:
      'Current page position indicator shown between the table pagination controls.',
  },
  firstPage: {
    id: 'frescoUi.dataTablePagination.firstPage',
    defaultMessage: 'Go to first page',
    description: 'Accessible name of the first-page pagination button.',
  },
  previousPage: {
    id: 'frescoUi.dataTablePagination.previousPage',
    defaultMessage: 'Go to previous page',
    description: 'Accessible name of the previous-page pagination button.',
  },
  nextPage: {
    id: 'frescoUi.dataTablePagination.nextPage',
    defaultMessage: 'Go to next page',
    description: 'Accessible name of the next-page pagination button.',
  },
  lastPage: {
    id: 'frescoUi.dataTablePagination.lastPage',
    defaultMessage: 'Go to last page',
    description: 'Accessible name of the last-page pagination button.',
  },
});

type DataTablePaginationProps<TData> = {
  table: Table<TData>;
};

export function DataTablePagination<TData>({
  table,
}: DataTablePaginationProps<TData>) {
  // TanStack Table returns a mutable ref with stable identity, defeating React Compiler memoization.
  'use no memo';
  const intl = useAppIntl();
  const pageCount = table.getPageCount();
  const showPageCount = pageCount > 0;

  return (
    <div className="tablet-landscape:flex-row tablet-landscape:gap-6 laptop:gap-8 mx-auto flex w-fit flex-col items-center justify-between gap-4">
      <div className="flex items-center space-x-2">
        <Paragraph
          intent="smallText"
          className="whitespace-nowrap"
          margin="none"
        >
          {intl.formatMessage(messages.rowsPerPage)}
        </Paragraph>
        <SelectField
          name="pageSize"
          size="sm"
          value={`${table.getState().pagination.pageSize}`}
          onChange={(value) => {
            table.setPageSize(Number(value));
          }}
          options={pageSizes.map((size) => ({
            label: size.toLocaleString(),
            value: size,
          }))}
          placeholder={table.getState().pagination.pageSize.toLocaleString()}
        />
      </div>
      {showPageCount && (
        <div className="flex items-center justify-center text-sm font-medium">
          {intl.formatMessage(messages.pageOf, {
            page: table.getState().pagination.pageIndex + 1,
            pageCount,
          })}
        </div>
      )}
      <div className="flex items-center space-x-2">
        <IconButton
          aria-label={intl.formatMessage(messages.firstPage)}
          variant="text"
          size="sm"
          onClick={() => table.setPageIndex(0)}
          disabled={!table.getCanPreviousPage()}
          icon={<ChevronsLeft />}
        />
        <IconButton
          aria-label={intl.formatMessage(messages.previousPage)}
          variant="text"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          icon={<ChevronLeft />}
        />
        <IconButton
          aria-label={intl.formatMessage(messages.nextPage)}
          variant="text"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          icon={<ChevronRight />}
        />
        <IconButton
          aria-label={intl.formatMessage(messages.lastPage)}
          variant="text"
          size="sm"
          onClick={() => table.setPageIndex(table.getPageCount() - 1)}
          disabled={!table.getCanNextPage()}
          icon={<ChevronsRight />}
        />
      </div>
    </div>
  );
}
