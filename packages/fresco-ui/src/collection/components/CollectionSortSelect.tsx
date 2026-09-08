'use client';

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useShallow } from 'zustand/shallow';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { Button, type ButtonProps } from '../../Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../DropdownMenu';
import { cx } from '../../utils/cva';
import { useCollectionStore, useOptionalSortManager } from '../contexts';
import type {
  SortableProperty,
  SortDirection,
  SortProperty,
} from '../sorting/types';

const messages = defineMessages({
  sortByPlaceholder: {
    id: 'frescoUi.collectionSortSelect.placeholder',
    defaultMessage: 'Sort by...',
    description:
      'Default label of the sort dropdown trigger when no sort is active.',
  },
  clearSorting: {
    id: 'frescoUi.collectionSortSelect.clearSorting',
    defaultMessage: 'Clear sorting',
    description: 'Menu action removing the active collection sort.',
  },
  toggleDirection: {
    id: 'frescoUi.collectionSortSelect.toggleDirection',
    defaultMessage:
      '{direction, select, asc {Sort ascending, click to toggle} other {Sort descending, click to toggle}}',
    description:
      'Accessible name of the sort-direction toggle button; announces the current direction.',
  },
});

type CollectionSortSelectProps = {
  /** Array of sortable properties to display in the dropdown */
  options: SortableProperty[];
  /** Placeholder text when no sort is active */
  placeholder?: string;
  /** Show clear option to remove sorting */
  showClearOption?: boolean;
  /** Show direction toggle button */
  showDirectionToggle?: boolean;
  /** Additional class name */
  className?: string;
  /** Button variant */
  variant?: ButtonProps['variant'];
  /** Button size */
  size?: ButtonProps['size'];
};

/**
 * Compares two SortProperty values for equality.
 */
function propertiesEqual(a: SortProperty, b: SortProperty): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((p, i) => p === b[i]);
  }
  return a === b;
}

/**
 * Pre-built dropdown component for selecting sort field and direction.
 * Must be used as a child of Collection.
 *
 * @example
 * ```tsx
 * <Collection items={users} keyExtractor={(u) => u.id} layout={layout} renderItem={renderUser}>
 *   <CollectionSortSelect
 *     options={[
 *       { property: 'name', label: 'Name', type: 'string' },
 *       { property: 'createdAt', label: 'Date Created', type: 'date' },
 *       { property: '*', label: 'Order Added', type: 'number' },
 *     ]}
 *     placeholder="Sort by..."
 *     showClearOption
 *   />
 * </Collection>
 * ```
 */
export function CollectionSortSelect({
  options,
  placeholder,
  showClearOption = true,
  showDirectionToggle = true,
  className,
  variant = 'outline',
  size = 'sm',
}: CollectionSortSelectProps) {
  const intl = useAppIntl();
  const sortManager = useOptionalSortManager();

  // Subscribe directly to the slice of sort state that we render. SortManager
  // is stable (by design), so it does not trigger re-renders on state change.
  const { currentProperty, currentDirection, isSorted } = useCollectionStore<
    unknown,
    {
      currentProperty: SortProperty | null;
      currentDirection: SortDirection;
      isSorted: boolean;
    }
  >(
    useShallow((state) => ({
      currentProperty: state.sortProperty,
      currentDirection: state.sortDirection,
      isSorted: state.sortProperty !== null || state.sortRules.length > 0,
    })),
  );

  if (!sortManager) {
    // eslint-disable-next-line no-console
    console.warn(
      'CollectionSortSelect must be used within a Collection component',
    );
    return null;
  }

  // Find the current option label
  const currentOption = currentProperty
    ? options.find((opt) => propertiesEqual(opt.property, currentProperty))
    : null;

  const handleSelect = (option: SortableProperty) => {
    sortManager.sortBy(
      option.property,
      option.type,
      undefined,
      option.hierarchy,
    );
  };

  const handleClear = () => {
    sortManager.clearSort();
  };

  const handleToggleDirection = () => {
    sortManager.toggleSortDirection();
  };

  return (
    <div className={cx('flex items-center gap-1', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant={variant} size={size}>
              {currentOption
                ? currentOption.label
                : (placeholder ??
                  intl.formatMessage(messages.sortByPlaceholder))}
              <ChevronsUpDownIcon className="ms-1 size-3.5 opacity-50" />
            </Button>
          }
        />
        <DropdownMenuContent align="start">
          {options.map((option) => {
            const isActive =
              currentProperty &&
              propertiesEqual(option.property, currentProperty);
            return (
              <DropdownMenuItem
                key={
                  Array.isArray(option.property)
                    ? option.property.join('.')
                    : option.property
                }
                onClick={() => handleSelect(option)}
                className={cx(isActive && 'bg-accent')}
              >
                {option.label}
              </DropdownMenuItem>
            );
          })}
          {showClearOption && isSorted && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleClear}>
                {intl.formatMessage(messages.clearSorting)}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {showDirectionToggle && isSorted && (
        <Button
          variant={variant}
          size={size}
          onClick={handleToggleDirection}
          aria-label={intl.formatMessage(messages.toggleDirection, {
            direction: currentDirection,
          })}
        >
          {currentDirection === 'asc' ? (
            <ArrowUpIcon className="size-3.5" />
          ) : (
            <ArrowDownIcon className="size-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}
