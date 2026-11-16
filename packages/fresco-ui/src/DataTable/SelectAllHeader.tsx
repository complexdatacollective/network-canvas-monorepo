'use client';

import { type RowData, type Table } from '@tanstack/react-table';
import { ChevronDown } from 'lucide-react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { IconButton } from '../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import Checkbox from '../form/fields/Checkbox';
import { type DataTableFeatures } from './features';

const messages = defineMessages({
  selectPage: {
    id: 'frescoUi.selectAllHeader.selectPage',
    defaultMessage: 'Select page ({count, number})',
    description:
      'Menu action selecting every row on the current page; {count} is the number of rows on the page.',
  },
  selectAll: {
    id: 'frescoUi.selectAllHeader.selectAll',
    defaultMessage: 'Select all ({count, number})',
    description:
      'Menu action selecting every row in the table; {count} is the total number of rows.',
  },
  deselectAll: {
    id: 'frescoUi.selectAllHeader.deselectAll',
    defaultMessage: 'Deselect all',
    description: 'Menu action clearing the table row selection.',
  },
});

type SelectAllHeaderProps<TData extends RowData> = {
  table: Table<DataTableFeatures, TData>;
};

export function SelectAllHeader<TData extends RowData>({
  table,
}: SelectAllHeaderProps<TData>) {
  'use no memo';
  const intl = useAppIntl();

  const isAllPageSelected = table.getIsAllPageRowsSelected();
  const isSomePage = table.getIsSomePageRowsSelected();
  const isAllSelected = table.getIsAllRowsSelected();
  const totalRows = table.getFilteredRowModel().rows.length;
  const pageRows = table.getRowModel().rows.length;
  const hasMultiplePages = totalRows > pageRows;

  return (
    <div className="flex items-center gap-0.5">
      <Checkbox
        checked={isAllPageSelected || isAllSelected}
        indeterminate={isSomePage && !isAllPageSelected}
        onCheckedChange={(value) => {
          if (isAllSelected) {
            table.toggleAllRowsSelected(false);
          } else {
            table.toggleAllPageRowsSelected(value);
          }
        }}
        aria-label="Select all on page"
        lang="en"
      />
      {hasMultiplePages && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <IconButton
                size="sm"
                variant="text"
                aria-label="Selection options"
                lang="en"
                icon={<ChevronDown aria-hidden="true" />}
              />
            }
            nativeButton
          />
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => table.toggleAllPageRowsSelected(true)}
            >
              {intl.formatMessage(messages.selectPage, { count: pageRows })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => table.toggleAllRowsSelected(true)}>
              {intl.formatMessage(messages.selectAll, { count: totalRows })}
            </DropdownMenuItem>
            {(isAllPageSelected || isAllSelected || isSomePage) && (
              <DropdownMenuItem
                onClick={() => table.toggleAllRowsSelected(false)}
              >
                {intl.formatMessage(messages.deselectAll)}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
