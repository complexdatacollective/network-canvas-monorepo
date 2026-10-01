'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/shallow';

import { useCollectionStore, useCollectionStoreApi } from '../contexts';
import { getInitialSortRules } from '../sorting/initialSortRules';
import { SortManager } from '../sorting/SortManager';
import type { SortProps, SortState } from '../sorting/types';

/**
 * Hook to manage sort state within a collection.
 * Returns a SortManager for performing sort operations.
 *
 * Follows the same pattern as useSelectionState.
 *
 * @param props - Sort configuration props
 * @returns SortManager instance
 *
 * @example
 * ```tsx
 * function MyCollection() {
 *   const sortManager = useSortState({
 *     defaultSortBy: 'name',
 *     defaultSortDirection: 'asc',
 *     defaultSortType: 'string',
 *     onSortChange: (state) => console.log('Sort changed:', state),
 *   });
 *
 *   return (
 *     <button onClick={() => sortManager.sortBy('name', 'string')}>
 *       Sort by Name
 *     </button>
 *   );
 * }
 * ```
 */
export function useSortState(props: SortProps = {}): SortManager {
  const {
    sortBy: controlledSortBy,
    sortDirection: controlledSortDirection,
    sortType: controlledSortType,
    defaultSortDirection = 'asc',
    onSortChange,
    sortRules: controlledSortRules,
  } = props;

  const storeApi = useCollectionStoreApi<unknown>();

  // Track if we're in controlled mode
  const isControlled = controlledSortBy !== undefined;
  const onSortChangeRef = useRef(onSortChange);
  onSortChangeRef.current = onSortChange;

  // Initialize sort state from default props synchronously (uncontrolled mode).
  // Runs before the store subscription so the first read picks up defaults.
  // CollectionProvider seeds the store with these same rules, so this is a
  // no-op for a Collection-created store; it keeps a bare CollectionProvider
  // (no rules passed) correct, re-sorting the already-seeded items.
  const hasInitialized = useRef(false);
  const initialSortRules = getInitialSortRules(props);
  if (!isControlled && !hasInitialized.current && initialSortRules.length > 0) {
    hasInitialized.current = true;
    const [firstRule] = initialSortRules;
    if (firstRule) {
      const store = storeApi.getState();
      store.updateSortState({
        sortProperty: firstRule.property,
        sortDirection: firstRule.direction ?? defaultSortDirection,
        sortType: firstRule.type,
        sortRules: initialSortRules,
      });
      store.resortItems();
    }
  }

  // Subscribe to sort state with shallow comparison. This hook drives the
  // SortManager's reactive reads for external consumers (e.g. user code that
  // reads `sortManager.sortProperty` during render).
  const sortState = useCollectionStore<unknown, SortState>(
    useShallow((state) => ({
      sortProperty: state.sortProperty,
      sortDirection: state.sortDirection,
      sortType: state.sortType,
      sortRules: state.sortRules,
    })),
  );

  // Sync controlled sort props
  useEffect(() => {
    if (isControlled) {
      const store = storeApi.getState();
      const rules = controlledSortBy
        ? [
            {
              property: controlledSortBy,
              direction: controlledSortDirection ?? 'asc',
              type: controlledSortType ?? 'string',
            },
          ]
        : [];
      store.updateSortState({
        sortProperty: controlledSortBy ?? null,
        sortDirection: controlledSortDirection ?? 'asc',
        sortType: controlledSortType ?? 'string',
        sortRules: controlledSortRules ?? rules,
      });
      store.resortItems();
    }
  }, [
    storeApi,
    isControlled,
    controlledSortBy,
    controlledSortDirection,
    controlledSortType,
    controlledSortRules,
  ]);

  // Create setState function for SortManager
  const setState = useCallback(
    (updates: Partial<SortState>) => {
      const store = storeApi.getState();

      if (isControlled) {
        // In controlled mode, only call onChange, don't update state directly
        if (
          'sortProperty' in updates ||
          'sortDirection' in updates ||
          'sortType' in updates
        ) {
          onSortChangeRef.current?.({
            property: updates.sortProperty ?? store.sortProperty,
            direction: updates.sortDirection ?? store.sortDirection,
            type: updates.sortType ?? store.sortType,
          });
        }
        // Don't update state in controlled mode - let parent manage it
      } else {
        // Uncontrolled mode - update state directly
        store.updateSortState(updates);
        // Re-sort items with new sort state
        store.resortItems();
      }
    },
    [storeApi, isControlled],
  );

  // Create SortManager
  const sortManager = useMemo(() => {
    return new SortManager(sortState, setState, {
      onSortChange: onSortChangeRef.current,
    });
  }, [sortState, setState]);

  return sortManager;
}
