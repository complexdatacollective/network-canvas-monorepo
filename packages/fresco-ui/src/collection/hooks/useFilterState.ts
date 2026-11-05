'use client';

import { debounce, type DebouncedFunction } from 'es-toolkit';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useShallow } from 'zustand/shallow';

import { useCollectionStore, useCollectionStoreApi } from '../contexts';
import { FilterManager } from '../filtering/FilterManager';
import type { FilterProps, FilterState } from '../filtering/types';
import type { Key, KeyExtractor } from '../types';
import { useSearchWorker } from './useSearchWorker';
import { useSynchronousSearch } from './useSynchronousSearch';

type UseFilterStateOptions<T> = FilterProps & {
  items: T[];
  keyExtractor: KeyExtractor<T>;
};

type FilterResultsChange = (matchingKeys: Set<Key>, matchCount: number) => void;

/**
 * What the filter's handlers call when they run: the latest callback props and
 * search, and the debounced search scheduler. The FilterManager is rebuilt on
 * every filter state change and the handlers it holds outlive the render that
 * created them, so they read these when called, never during render. The
 * hook's effects keep it current.
 */
class FilterCallTargets {
  onFilterChange: ((query: string) => void) | undefined;
  onFilterResultsChange: FilterResultsChange | undefined;
  performSearch: (query: string) => Promise<void> = () => Promise.resolve();
  private debouncedSearch: DebouncedFunction<(query: string) => void> | null =
    null;

  update(values: {
    onFilterChange: ((query: string) => void) | undefined;
    onFilterResultsChange: FilterResultsChange | undefined;
    performSearch: (query: string) => Promise<void>;
  }) {
    this.onFilterChange = values.onFilterChange;
    this.onFilterResultsChange = values.onFilterResultsChange;
    this.performSearch = values.performSearch;
  }

  setDebouncedSearch(
    debouncedSearch: DebouncedFunction<(query: string) => void> | null,
  ) {
    this.debouncedSearch = debouncedSearch;
  }

  scheduleSearch(query: string) {
    this.debouncedSearch?.(query);
  }
}

/**
 * Hook to manage filter state within a collection.
 * Returns a FilterManager for performing filter operations.
 *
 * @param options - Filter configuration and items
 * @returns FilterManager instance or null if filtering is disabled
 */
export function useFilterState<T extends Record<string, unknown>>(
  options: UseFilterStateOptions<T>,
): FilterManager | null {
  const {
    filterQuery: controlledFilterQuery,
    defaultFilterQuery,
    onFilterChange,
    onFilterResultsChange,
    filterKeys,
    filterExecution = 'worker',
    filterFuseOptions,
    filterDebounceMs = 300,
    filterMinQueryLength = 1,
    items,
    keyExtractor,
  } = options;

  const storeApi = useCollectionStoreApi<unknown>();

  // Determine if filtering is enabled - must be stable for hooks
  const isFilteringEnabled = Boolean(filterKeys && filterKeys.length > 0);
  const safeFilterKeys = isFilteringEnabled ? filterKeys! : ['_placeholder_'];

  // Track if we're in controlled mode
  const isControlled = controlledFilterQuery !== undefined;
  const [callTargets] = useState(() => new FilterCallTargets());

  // Initialize the search worker (always called, but with empty items if disabled)
  const workerSearch = useSearchWorker({
    enabled: isFilteringEnabled && filterExecution === 'worker',
    items: isFilteringEnabled ? items : [],
    keyExtractor,
    filterKeys: safeFilterKeys,
    fuseOptions: filterFuseOptions,
  });
  const synchronousItems = useMemo(
    () =>
      isFilteringEnabled && filterExecution === 'sync' ? items : ([] as T[]),
    [filterExecution, isFilteringEnabled, items],
  );
  const synchronousSearch = useSynchronousSearch({
    items: synchronousItems,
    keyExtractor,
    filterKeys: safeFilterKeys,
    fuseOptions: filterFuseOptions,
  });
  const { search, isReady, isIndexing } =
    filterExecution === 'sync' ? synchronousSearch : workerSearch;

  // Subscribe to filter state with shallow comparison. This drives the
  // FilterManager's reactive reads for external consumers.
  const filterState = useCollectionStore<unknown, FilterState>(
    useShallow((state) => ({
      filterQuery: state.filterQuery,
      filterDebouncedQuery: state.filterDebouncedQuery,
      filterIsFiltering: state.filterIsFiltering,
      filterIsIndexing: state.filterIsIndexing,
      filterMatchCount: state.filterMatchCount,
      filterMatchingKeys: state.filterMatchingKeys,
      filterScores: state.filterScores,
    })),
  );

  // Sync isIndexing from worker to store
  useEffect(() => {
    if (!isFilteringEnabled) return;
    const store = storeApi.getState();
    store.updateFilterState({ filterIsIndexing: isIndexing });
  }, [storeApi, isIndexing, isFilteringEnabled]);

  // Initialize filter state from default props (uncontrolled mode)
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (!isFilteringEnabled) return;
    if (!isControlled && !hasInitialized.current && defaultFilterQuery) {
      const store = storeApi.getState();
      store.updateFilterState({
        filterQuery: defaultFilterQuery,
        filterDebouncedQuery: defaultFilterQuery,
      });
      hasInitialized.current = true;
    }
  }, [storeApi, isControlled, defaultFilterQuery, isFilteringEnabled]);

  // Sync controlled filter props
  useEffect(() => {
    if (!isFilteringEnabled) return;
    if (isControlled) {
      const store = storeApi.getState();
      store.updateFilterState({
        filterQuery: controlledFilterQuery,
      });
    }
  }, [storeApi, isControlled, controlledFilterQuery, isFilteringEnabled]);

  // Perform search when debounced query changes
  const performSearch = useCallback(
    async (query: string) => {
      if (!isReady || !isFilteringEnabled) return;

      const store = storeApi.getState();
      store.updateFilterState({ filterIsFiltering: true });

      try {
        const result = await search(query, filterMinQueryLength);

        // Check if query is empty or below min length
        const isEmptyQuery = query.length < filterMinQueryLength;

        store.updateFilterState({
          filterDebouncedQuery: query,
          filterMatchingKeys: isEmptyQuery ? null : result.matchingKeys,
          filterMatchCount: isEmptyQuery ? null : result.matchCount,
          filterScores: isEmptyQuery ? null : result.scores,
          filterIsFiltering: false,
        });

        // Re-apply filtering and sorting
        store.resortItems();

        // Notify callback if provided
        if (!isEmptyQuery) {
          callTargets.onFilterResultsChange?.(
            result.matchingKeys,
            result.matchCount,
          );
        }
      } catch {
        store.updateFilterState({ filterIsFiltering: false });
      }
    },
    [
      storeApi,
      search,
      isReady,
      filterMinQueryLength,
      isFilteringEnabled,
      callTargets,
    ],
  );

  // Keep the handlers' call targets on the latest props and search. Declared
  // before every effect that schedules a search.
  useLayoutEffect(() => {
    callTargets.update({
      onFilterChange,
      onFilterResultsChange,
      performSearch,
    });
  });

  // Create debounced search function
  useEffect(() => {
    const debouncedSearch = debounce(
      (query: string) => void callTargets.performSearch(query),
      filterDebounceMs,
    );
    callTargets.setDebouncedSearch(debouncedSearch);

    return () => {
      debouncedSearch.cancel();
    };
  }, [callTargets, filterDebounceMs]);

  // Create setState function for FilterManager
  const setState = useCallback(
    (updates: Partial<FilterState>) => {
      if (!isFilteringEnabled) return;

      const store = storeApi.getState();

      if (isControlled) {
        // In controlled mode, only call onChange, don't update state directly
        if ('filterQuery' in updates && updates.filterQuery !== undefined) {
          callTargets.onFilterChange?.(updates.filterQuery);
        }
        // Don't update state in controlled mode - let parent manage it
      } else {
        // Uncontrolled mode - update state directly
        store.updateFilterState(updates);

        // If query changed, trigger debounced search
        if ('filterQuery' in updates && updates.filterQuery !== undefined) {
          callTargets.scheduleSearch(updates.filterQuery);
        }
      }
    },
    [storeApi, isControlled, isFilteringEnabled, callTargets],
  );

  // Trigger search when controlled query changes, or when the index is
  // rebuilt (a new `search`) so the query is answered from the new items. The
  // search itself is reached through `callTargets`.
  useEffect(() => {
    if (!isFilteringEnabled) return;
    if (isControlled && isReady) {
      callTargets.scheduleSearch(controlledFilterQuery ?? '');
    }
  }, [
    isControlled,
    controlledFilterQuery,
    isReady,
    isFilteringEnabled,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a re-run trigger: a rebuilt index must answer the current query again
    search,
    callTargets,
  ]);

  // Trigger the initial uncontrolled search when the index becomes ready, and
  // re-run it if a synchronous index is rebuilt for a different item set.
  useEffect(() => {
    if (!isFilteringEnabled) return;
    if (!isControlled && isReady) {
      const store = storeApi.getState();
      const currentQuery = store.filterQuery;
      if (currentQuery) {
        callTargets.scheduleSearch(currentQuery);
      }
    }
  }, [
    isReady,
    storeApi,
    isFilteringEnabled,
    isControlled,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- a re-run trigger: a rebuilt index must answer the current query again
    search,
    callTargets,
  ]);

  // Create FilterManager (or return default state if disabled). Its callbacks
  // call through to the props that are current when they run.
  const filterManager = useMemo(() => {
    if (!isFilteringEnabled) {
      return null;
    }
    return new FilterManager(filterState, setState, {
      onFilterChange: (query) => callTargets.onFilterChange?.(query),
      onFilterResultsChange: (matchingKeys, matchCount) =>
        callTargets.onFilterResultsChange?.(matchingKeys, matchCount),
    });
  }, [filterState, setState, isFilteringEnabled, callTargets]);

  return filterManager;
}
