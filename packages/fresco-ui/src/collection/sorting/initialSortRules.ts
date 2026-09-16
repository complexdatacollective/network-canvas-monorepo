import type { SortProps, SortRule, SortState } from './types';

/**
 * The sort a collection starts with, resolved from its props: explicit
 * `sortRules` win, else a single rule from the controlled `sortBy` or the
 * uncontrolled `defaultSortBy`, else no sort. Shared by the store seed (so
 * server and static markup are already in this order) and `useSortState`.
 */
export function getInitialSortRules({
  sortBy,
  sortDirection = 'asc',
  sortType = 'string',
  defaultSortBy,
  defaultSortDirection = 'asc',
  defaultSortType = 'string',
  sortRules,
}: SortProps): SortRule[] {
  if (sortRules && sortRules.length > 0) return sortRules;
  if (sortBy !== undefined) {
    return [{ property: sortBy, direction: sortDirection, type: sortType }];
  }
  if (defaultSortBy !== undefined) {
    return [
      {
        property: defaultSortBy,
        direction: defaultSortDirection,
        type: defaultSortType,
      },
    ];
  }
  return [];
}

/** The store's sort state for a set of rules, mirroring the first rule. */
export function sortStateForRules(rules: SortRule[]): SortState {
  const [first] = rules;
  return {
    sortProperty: first?.property ?? null,
    sortDirection: first?.direction ?? 'asc',
    sortType: first?.type ?? 'string',
    sortRules: rules,
  };
}
