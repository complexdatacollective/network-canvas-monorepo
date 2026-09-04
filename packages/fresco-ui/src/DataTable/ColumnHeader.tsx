'use client';

import { type Column, type Table } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowDown01,
  ArrowDownAZ,
  ArrowUp,
  ArrowUp01,
  ArrowUpAZ,
  Filter,
} from 'lucide-react';
import React, { type ReactNode, useRef, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import Button, { buttonVariants } from '../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../DropdownMenu';
import { Popover, PopoverContent } from '../Popover';
import { cx } from '../utils/cva';
import BooleanFilter from './filters/BooleanFilter';
import DateFilter from './filters/DateFilter';
import FacetedFilter from './filters/FacetedFilter';
import OperatorFilter from './filters/OperatorFilter';
import RangeFilter from './filters/RangeFilter';
import TextFilter from './filters/TextFilter';
import { type FilterConfig, type FilterValue } from './filters/types';

const stringSortFns = new Set(['text', 'textCaseSensitive']);

const messages = defineMessages({
  sortAscending: {
    id: 'frescoUi.columnHeader.sortAscending',
    defaultMessage: 'Sort ascending',
    description: 'Column menu action sorting the table in ascending order.',
  },
  sortDescending: {
    id: 'frescoUi.columnHeader.sortDescending',
    defaultMessage: 'Sort descending',
    description: 'Column menu action sorting the table in descending order.',
  },
  clearSort: {
    id: 'frescoUi.columnHeader.clearSort',
    defaultMessage: 'Clear sort',
    description: 'Column menu action removing the sort on this column.',
  },
  filterAction: {
    id: 'frescoUi.columnHeader.filterAction',
    defaultMessage: '{isFiltered, select, true {Edit filter} other {Filter}}',
    description:
      'Column menu action opening the filter editor; says whether a filter already exists on the column.',
  },
  clearFilter: {
    id: 'frescoUi.columnHeader.clearFilter',
    defaultMessage: 'Clear',
    description: 'Button discarding the filter being edited for a column.',
  },
  applyFilter: {
    id: 'frescoUi.columnHeader.applyFilter',
    defaultMessage: 'Apply',
    description: 'Button applying the filter being edited for a column.',
  },
});

type DataTableColumnHeaderProps<TData, TValue> = {
  column: Column<TData, TValue>;
  title: ReactNode;
  table?: Table<TData>;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>;

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  table,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  'use no memo';

  const intl = useAppIntl();
  const meta = column.columnDef.meta;
  const filterConfig = meta?.filterConfig;
  const hasFilter = !!meta?.filterType && !!filterConfig;

  const sortingFn = column.columnDef.sortingFn;
  const isStringSortFn =
    typeof sortingFn === 'string' && stringSortFns.has(sortingFn);

  const isFiltered = column.getIsFiltered();
  const canSort = column.getCanSort();
  const isSorted = column.getIsSorted();

  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [stagedValue, setStagedValue] = useState<FilterValue | undefined>(
    undefined,
  );

  const isActive = isSorted !== false || isFiltered || menuOpen || filterOpen;

  if (!canSort && !hasFilter) {
    return (
      <div
        className={cx(
          buttonVariants({ variant: 'text', size: 'sm' }),
          'pointer-events-none -mx-4 min-w-max px-4! text-base',
          className,
        )}
      >
        {title}
      </div>
    );
  }

  const handleOpenFilter = () => {
    setStagedValue(column.getFilterValue() as FilterValue | undefined);
    // Defer opening so the dropdown menu has time to fully close first.
    // Without this, the popover opens and immediately closes because the
    // dropdown's close handler fires after our open.
    requestAnimationFrame(() => {
      setFilterOpen(true);
    });
  };

  const handleApplyFilter = () => {
    column.setFilterValue(stagedValue);
    setFilterOpen(false);
  };

  const handleClearFilter = () => {
    column.setFilterValue(undefined);
    setStagedValue(undefined);
    setFilterOpen(false);
  };

  const icons: ReactNode[] = [];
  if (isSorted === 'asc')
    icons.push(<ArrowUp key="sort" className="size-4 text-current" />);
  if (isSorted === 'desc')
    icons.push(<ArrowDown key="sort" className="size-4 text-current" />);
  if (isFiltered)
    icons.push(<Filter key="filter" className="text-selected size-4" />);

  const data =
    hasFilter && table
      ? table.getCoreRowModel().rows.map((r) => r.original)
      : [];

  const canFilter =
    hasFilter &&
    !(
      filterConfig?.type === 'operator' &&
      filterConfig.entitySelector?.getOptions(data).length === 0
    );

  return (
    <>
      <DropdownMenu onOpenChange={(open) => setMenuOpen(open)}>
        <DropdownMenuTrigger
          ref={buttonRef}
          render={
            <Button
              className="-mx-4 min-w-max px-4!"
              // NOT `aria-pressed`, because of what `isActive` MEANS here. ARIA
              // does permit `aria-pressed` alongside `aria-expanded`, so a menu
              // trigger that is genuinely a toggle could carry both — but
              // `isActive` is mostly not about this button. Two of its four
              // terms (`isSorted`, `isFiltered`) describe the COLUMN's data
              // state, so `aria-pressed` would announce "pressed" for a column
              // that is merely sorted with the menu shut, implying that
              // activating it would un-press it. It opens a menu instead, and
              // `aria-expanded` already carries the open/closed half.
              selected={isActive}
              variant="text"
              color="dynamic"
              iconPosition="right"
              icon={
                icons.length > 0 ? (
                  <span className="flex gap-0.5">{icons}</span>
                ) : undefined
              }
            />
          }
          nativeButton
        >
          {title}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {canSort && (
            <DropdownMenuRadioGroup
              value={isSorted || undefined}
              onValueChange={(value) => column.toggleSorting(value !== 'asc')}
              className="flex flex-col gap-1"
            >
              <DropdownMenuRadioItem
                value="asc"
                closeOnClick
                icon={isStringSortFn ? <ArrowUpAZ /> : <ArrowUp01 />}
              >
                {intl.formatMessage(messages.sortAscending)}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="desc"
                closeOnClick
                icon={isStringSortFn ? <ArrowDownAZ /> : <ArrowDown01 />}
              >
                {intl.formatMessage(messages.sortDescending)}
              </DropdownMenuRadioItem>

              {isSorted !== false && (
                <DropdownMenuItem onClick={() => column.clearSorting()}>
                  {intl.formatMessage(messages.clearSort)}
                </DropdownMenuItem>
              )}
            </DropdownMenuRadioGroup>
          )}
          {canSort && canFilter && <DropdownMenuSeparator />}
          {canFilter && (
            <DropdownMenuItem
              onClick={handleOpenFilter}
              icon={<Filter />}
              closeOnClick
            >
              {intl.formatMessage(messages.filterAction, {
                isFiltered: String(isFiltered),
              })}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canFilter && filterConfig && (
        <Popover open={filterOpen} onOpenChange={setFilterOpen}>
          <PopoverContent align="start" anchor={buttonRef}>
            <div className="flex flex-col gap-2">
              <FilterRenderer
                filterConfig={filterConfig}
                value={stagedValue}
                onChange={setStagedValue}
                data={data}
              />
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="text"
                  color="dynamic"
                  onClick={handleClearFilter}
                >
                  {intl.formatMessage(messages.clearFilter)}
                </Button>
                <Button size="sm" color="primary" onClick={handleApplyFilter}>
                  {intl.formatMessage(messages.applyFilter)}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}

function FilterRenderer({
  filterConfig,
  value,
  onChange,
  data,
}: {
  filterConfig: FilterConfig;
  value: FilterValue | undefined;
  onChange: (value: FilterValue | undefined) => void;
  data: unknown[];
}) {
  switch (filterConfig.type) {
    case 'range':
      return (
        <RangeFilter
          value={value as Parameters<typeof RangeFilter>[0]['value']}
          onChange={onChange}
          config={filterConfig}
        />
      );
    case 'date':
      return (
        <DateFilter
          value={value as Parameters<typeof DateFilter>[0]['value']}
          onChange={onChange}
          config={filterConfig}
        />
      );
    case 'text':
      return (
        <TextFilter
          value={value as Parameters<typeof TextFilter>[0]['value']}
          onChange={onChange}
          config={filterConfig}
        />
      );
    case 'boolean':
      return (
        <BooleanFilter
          value={value as Parameters<typeof BooleanFilter>[0]['value']}
          onChange={onChange}
          config={filterConfig}
        />
      );
    case 'faceted':
      return (
        <FacetedFilter
          value={value as Parameters<typeof FacetedFilter>[0]['value']}
          onChange={onChange}
          config={filterConfig}
          data={data}
        />
      );
    case 'operator':
      return (
        <OperatorFilter
          value={value as Parameters<typeof OperatorFilter>[0]['value']}
          onChange={onChange}
          config={filterConfig}
          data={data}
        />
      );
    default:
      return null;
  }
}
