/**
 * Creates a sort function for collection items.
 *
 * Adapted from lib/interviewer/utils/createSorter.ts for use in the
 * Collection component system.
 */

import { get } from 'es-toolkit/compat';

import type { SortDirection, SortOptionValue, SortRule } from './types';

type Item = Record<string, unknown>;

/**
 * Creating a collator that is reused by string comparison is significantly faster
 * than using `localeCompare` directly.
 *
 * See: https://stackoverflow.com/a/52369951/1497330
 */
const collator = new Intl.Collator();

/**
 * Maps a `_createdIndex` index value to all items in an array.
 * Used for FIFO/LIFO sorting by original array position.
 */
const withCreatedIndex = <T extends Item>(items: T[]) =>
  items.map((item, _createdIndex) => ({ ...item, _createdIndex }));

/**
 * Removes the '_createdIndex' prop from items after sorting.
 */
const withoutCreatedIndex = <T extends Item>(
  items: (T & { _createdIndex?: number })[],
) => items.map(({ _createdIndex: _, ...originalItem }) => originalItem as T);

type PropertyGetter<T extends Item> = (item: T) => unknown;

/**
 * Helper that returns a function compatible with Array.sort that uses an
 * arbitrary `propertyGetter` function to fetch values for comparison.
 * Ascending order.
 */
const asc =
  <T extends Item>(propertyGetter: PropertyGetter<T>) =>
  (a: T, b: T) => {
    const firstValue = propertyGetter(a);
    const secondValue = propertyGetter(b);

    if (firstValue === null || firstValue === undefined) {
      return 1;
    }

    if (secondValue === null || secondValue === undefined) {
      return -1;
    }

    return (
      -Number(firstValue < secondValue) || +Number(firstValue > secondValue)
    );
  };

/**
 * Descending order - reverses the comparison.
 */
const desc =
  <T extends Item>(propertyGetter: PropertyGetter<T>) =>
  (a: T, b: T) =>
    asc(propertyGetter)(b, a);

export type SortFn<T extends Item> = (a: T, b: T) => number;

/**
 * Helper function that executes a series of functions in order, passing until
 * one of them returns a non-zero value.
 *
 * Used to chain together multiple sort functions.
 */
const chain =
  <T extends Item>(...fns: SortFn<T>[]) =>
  (a: T, b: T) =>
    fns.reduce((diff, fn) => diff || fn(a, b), 0);

/**
 * Get the value from an item at the given property path.
 */
const getValue = <T extends Item>(
  item: T,
  property: string | string[],
): unknown => {
  return get(item, property, null);
};

/**
 * String comparison sort function.
 * Handles null/undefined values by placing them at the end.
 */
const stringFunction =
  <T extends Item>(
    property: string | string[],
    direction: SortDirection,
  ): SortFn<T> =>
  (a: T, b: T) => {
    const firstValue = getValue(a, property) as string | null;
    const secondValue = getValue(b, property) as string | null;

    if (firstValue === null || typeof firstValue !== 'string') {
      return 1;
    }

    if (secondValue === null || typeof secondValue !== 'string') {
      return -1;
    }

    if (direction === 'asc') {
      return collator.compare(firstValue, secondValue);
    }

    return collator.compare(secondValue, firstValue);
  };

/**
 * Number comparison sort function.
 */
const numberFunction =
  <T extends Item>(
    property: string | string[],
    direction: SortDirection,
  ): SortFn<T> =>
  (a: T, b: T) => {
    const firstValue = getValue(a, property);
    const secondValue = getValue(b, property);

    // Handle null/undefined/non-number values
    const firstNum =
      typeof firstValue === 'number' && !Number.isNaN(firstValue)
        ? firstValue
        : direction === 'asc'
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
    const secondNum =
      typeof secondValue === 'number' && !Number.isNaN(secondValue)
        ? secondValue
        : direction === 'asc'
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;

    if (direction === 'asc') {
      return firstNum - secondNum;
    }
    return secondNum - firstNum;
  };

/**
 * Date comparison sort function.
 */
const dateFunction =
  <T extends Item>(
    property: string | string[],
    direction: SortDirection,
  ): SortFn<T> =>
  (a: T, b: T) => {
    const firstValueString = getValue(a, property) as string | null;
    const secondValueString = getValue(b, property) as string | null;

    const firstValueDate = Date.parse(firstValueString ?? '');
    const secondValueDate = Date.parse(secondValueString ?? '');

    if (Number.isNaN(firstValueDate)) {
      return 1;
    }

    if (Number.isNaN(secondValueDate)) {
      return -1;
    }

    if (direction === 'asc') {
      return (
        -Number(firstValueDate < secondValueDate) ||
        +Number(firstValueDate > secondValueDate)
      );
    }

    return (
      -Number(firstValueDate > secondValueDate) ||
      +Number(firstValueDate < secondValueDate)
    );
  };

/**
 * Boolean comparison sort function.
 * false < true in ascending order.
 */
const booleanFunction =
  <T extends Item>(
    property: string | string[],
    direction: SortDirection,
  ): SortFn<T> =>
  (a: T, b: T) => {
    const firstValue = getValue(a, property);
    const secondValue = getValue(b, property);

    // Convert to boolean, default false for null/undefined
    const firstBool = Boolean(firstValue);
    const secondBool = Boolean(secondValue);

    if (firstBool === secondBool) return 0;

    if (direction === 'asc') {
      return firstBool ? 1 : -1;
    }
    return firstBool ? -1 : 1;
  };

/**
 * Index of an arbitrary value within the ordered option list (rank), or -1 if
 * it is not present. Uses strict equality so an `unknown` attribute value can be
 * located without a type assertion.
 */
const indexInHierarchy = (
  value: unknown,
  hierarchy: SortOptionValue[],
): number => hierarchy.findIndex((option) => option === value);

/**
 * Hierarchy (ordinal) comparison sort function. Orders items by the index of
 * their value within the supplied option list (rank). Values absent from the
 * list sink to the end. Mirrors the interview's createSorter hierarchyFunction.
 */
const hierarchyFunction =
  <T extends Item>(
    property: string | string[],
    direction: SortDirection,
    hierarchy: SortOptionValue[],
  ): SortFn<T> =>
  (a: T, b: T) => {
    const firstValue = getValue(a, property);
    const secondValue = getValue(b, property);

    // Explicit null/undefined check (not a falsy guard) so option values of 0
    // or false sort by their hierarchy index rather than being treated as
    // missing and forced to the end.
    if (firstValue === null || firstValue === undefined) {
      return 1;
    }
    if (secondValue === null || secondValue === undefined) {
      return -1;
    }

    const firstIndex = indexInHierarchy(firstValue, hierarchy);
    const secondIndex = indexInHierarchy(secondValue, hierarchy);

    // Values not in the hierarchy are sorted to the end of the list.
    if (firstIndex === -1) {
      return 1;
    }
    if (secondIndex === -1) {
      return -1;
    }

    if (direction === 'asc') {
      return firstIndex - secondIndex;
    }
    return secondIndex - firstIndex;
  };

/** The selected option values of a stored categorical attribute, or an empty
 * array when nothing is selected. Categorical attributes are stored as arrays
 * of selected option values. */
const toCategoricalValues = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

/** The best (lowest) hierarchy index across a node's full selection set. A value
 * not in the hierarchy contributes Infinity so it sinks below ranked values
 * without making the whole set unranked. Returns Infinity for an empty set. */
const bestHierarchyIndex = (values: unknown[], hierarchy: SortOptionValue[]) =>
  values.reduce<number>((best, value) => {
    const index = indexInHierarchy(value, hierarchy);
    if (index === -1) {
      return best;
    }
    return index < best ? index : best;
  }, Number.POSITIVE_INFINITY);

/**
 * Categorical comparison sort function. Categorical attribute values are stored
 * as arrays of selected option values; items are ordered by the best (lowest)
 * option index across the selection. Empty selections sink to the end. Mirrors
 * the interview's createSorter categoricalFunction.
 */
const categoricalFunction =
  <T extends Item>(
    property: string | string[],
    direction: SortDirection,
    hierarchy: SortOptionValue[],
  ): SortFn<T> =>
  (a: T, b: T) => {
    const firstValues = toCategoricalValues(getValue(a, property));
    const secondValues = toCategoricalValues(getValue(b, property));

    if (firstValues.length === 0 && secondValues.length === 0) {
      return 0;
    }
    if (firstValues.length === 0) {
      return 1;
    }
    if (secondValues.length === 0) {
      return -1;
    }

    const firstIndex = bestHierarchyIndex(firstValues, hierarchy);
    const secondIndex = bestHierarchyIndex(secondValues, hierarchy);

    if (direction === 'asc') {
      return firstIndex - secondIndex;
    }
    return secondIndex - firstIndex;
  };

/**
 * Transforms a sort rule into a sort function compatible with Array.sort.
 */
const getSortFunction = <T extends Item>(
  rule: SortRule,
): SortFn<T & { _createdIndex?: number }> => {
  const { property, direction = 'asc', type, hierarchy = [] } = rule;

  // LIFO/FIFO rule sorted by _createdIndex (original array position)
  if (property === '*') {
    return direction === 'asc'
      ? asc((item) => get(item, '_createdIndex'))
      : desc((item) => get(item, '_createdIndex'));
  }

  switch (type) {
    case 'string':
      return stringFunction(property, direction);
    case 'number':
      return numberFunction(property, direction);
    case 'date':
      return dateFunction(property, direction);
    case 'boolean':
      return booleanFunction(property, direction);
    case 'hierarchy':
      return hierarchyFunction(property, direction, hierarchy);
    case 'categorical':
      return categoricalFunction(property, direction, hierarchy);
    default:
      // Default to string comparison
      return stringFunction(property, direction);
  }
};

/**
 * Creates a sort function that sorts a collection of items according to a set
 * of sort rules.
 *
 * @param sortRules - Array of sort rules to apply in order
 * @returns A function that takes items and returns sorted items
 *
 * @example
 * ```ts
 * // Sort by name ascending
 * const sorter = createCollectionSorter([
 *   { property: 'name', direction: 'asc', type: 'string' }
 * ]);
 * const sorted = sorter(users);
 *
 * // Sort by array order (newest first = LIFO)
 * const lifoSorter = createCollectionSorter([
 *   { property: '*', direction: 'desc', type: 'number' }
 * ]);
 *
 * // Sort by nested property
 * const nestedSorter = createCollectionSorter([
 *   { property: ['profile', 'displayName'], direction: 'asc', type: 'string' }
 * ]);
 *
 * // Multi-field sort
 * const multiSorter = createCollectionSorter([
 *   { property: 'lastName', direction: 'asc', type: 'string' },
 *   { property: 'firstName', direction: 'asc', type: 'string' },
 * ]);
 * ```
 */
const createCollectionSorter = <T extends Item = Item>(
  sortRules: SortRule[] = [],
  prefixFns: SortFn<T & { _createdIndex?: number }>[] = [],
) => {
  const sortFunctions = sortRules.map(getSortFunction<T>);
  const allFns = [...prefixFns, ...sortFunctions];

  if (allFns.length === 0) {
    return (items: T[]) => items;
  }

  return (items: T[]) => {
    return withoutCreatedIndex(
      withCreatedIndex(items).toSorted(chain(...allFns)),
    );
  };
};

export default createCollectionSorter;
