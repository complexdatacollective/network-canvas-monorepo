'use client';

import { type Table } from '@tanstack/react-table';
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

const messages = defineMessages({
  selectAllOnPage: {
    id: 'frescoUi.selectAllHeader.selectAllOnPage',
    defaultMessage: 'Select all on page',
    description:
      'Accessible name of the header checkbox that selects every row on the current table page.',
  },
  selectionOptions: {
    id: 'frescoUi.selectAllHeader.selectionOptions',
    defaultMessage: 'Selection options',
    description:
      'Accessible name of the dropdown offering page-wide and table-wide selection actions.',
  },
  selectPage: {
    id: 'frescoUi.selectAllHeader.selectPage',
    defaultMessage: 'Select page ({count})',
    description:
      'Menu action selecting every row on the current page; {count} is the number of rows on the page.',
  },
  selectAll: {
    id: 'frescoUi.selectAllHeader.selectAll',
    defaultMessage: 'Select all ({count})',
    description:
      'Menu action selecting every row in the table; {count} is the total number of rows.',
  },
  deselectAll: {
    id: 'frescoUi.selectAllHeader.deselectAll',
    defaultMessage: 'Deselect all',
    description: 'Menu action clearing the table row selection.',
  },
});

type SelectAllHeaderProps<TData> = {
  table: Table<TData>;
};

export function SelectAllHeader<TData>({ table }: SelectAllHeaderProps<TData>) {
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
        aria-label={intl.formatMessage(messages.selectAllOnPage)}
      />
      {hasMultiplePages && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <IconButton
                size="sm"
                variant="text"
                aria-label={intl.formatMessage(messages.selectionOptions)}
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
