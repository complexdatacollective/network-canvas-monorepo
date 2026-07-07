/**
 * Sort-related types for the Collection component system.
 */

/**
 * Property to sort by.
 * - string: Direct property name (e.g., 'name'), or '*' for array order
 * - string[]: Nested property path (e.g., ['profile', 'displayName'])
 *
 * Use '*' as the property to sort by array order (FIFO/LIFO based on
 * original item positions).
 */
export type SortProperty = string | string[];

/**
 * Sort direction.
 * - 'asc': Ascending (A-Z, 0-9, oldest first)
 * - 'desc': Descending (Z-A, 9-0, newest first)
 */
export type SortDirection = 'asc' | 'desc';

/**
 * A single option value that can appear in a ranked option list (hierarchy).
 * Mirrors the codebook option `value` shape (string | number | boolean).
 */
export type SortOptionValue = string | number | boolean;

/**
 * Type of value being sorted, determines comparison logic.
 * - 'string': Locale-aware string comparison
 * - 'number': Numeric comparison
 * - 'date': Date parsing and comparison
 * - 'boolean': Boolean comparison (false < true)
 * - 'hierarchy': Ordinal comparison by codebook option index (rank). Requires
 *   `hierarchy` to be supplied (the ordered option value list).
 * - 'categorical': Comparison of an array-valued attribute by the best (lowest)
 *   codebook option index across the selection. Requires `hierarchy`.
 */
export type SortType =
  | 'string'
  | 'number'
  | 'date'
  | 'boolean'
  | 'hierarchy'
  | 'categorical';

/**
 * A single sort rule defining how to sort items.
 */
export type SortRule = {
  /** Property to sort by */
  property: SortProperty;
  /** Sort direction (default: 'asc') */
  direction?: SortDirection;
  /** Type of comparison to use */
  type: SortType;
  /**
   * Ordered option value list (rank) for 'hierarchy'/'categorical' sorts.
   * Items are ordered by the index of their value in this list.
   */
  hierarchy?: SortOptionValue[];
};

/**
 * Sort state managed by the store.
 */
export type SortState = {
  /** Currently active sort property (null if no sorting) */
  sortProperty: SortProperty | null;
  /** Current sort direction */
  sortDirection: SortDirection;
  /** Type of the current sort */
  sortType: SortType;
  /** Advanced: Multiple sort rules for chained sorting */
  sortRules: SortRule[];
};

/**
 * Describes a sortable property for UI components.
 */
export type SortableProperty = {
  /** Property path to sort by */
  property: SortProperty;
  /** Display label for the UI */
  label: string;
  /** Type of comparison to use */
  type: SortType;
  /**
   * Ordered option value list (rank) for 'hierarchy'/'categorical' sortable
   * properties, so consumers can build a ranked sort rule.
   */
  hierarchy?: SortOptionValue[];
};

/**
 * Props for configuring sort behavior on the Collection component.
 */
export type SortProps = {
  /** Controlled: Current sort property */
  sortBy?: SortProperty;
  /** Controlled: Current sort direction */
  sortDirection?: SortDirection;
  /** Controlled: Current sort type */
  sortType?: SortType;
  /** Default sort property (uncontrolled) */
  defaultSortBy?: SortProperty;
  /** Default sort direction (uncontrolled) */
  defaultSortDirection?: SortDirection;
  /** Default sort type (uncontrolled) */
  defaultSortType?: SortType;
  /** Callback when sort changes */
  onSortChange?: (state: {
    property: SortProperty | null;
    direction: SortDirection;
    type: SortType;
  }) => void;
  /** Advanced: Sort rules for multi-field sorting */
  sortRules?: SortRule[];
};

/**
 * Default sort state values.
 */
export const defaultSortState: SortState = {
  sortProperty: null,
  sortDirection: 'asc',
  sortType: 'string',
  sortRules: [],
};
