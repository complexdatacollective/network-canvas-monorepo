import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';
import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';

import {
  parseDataViewSearch,
  serializeDataViewState,
} from './dataViewUrlState';

// Owns the DataView table state that round-trips through the URL query
// string (global search, column filters, sorting), so filtered views are
// shareable, reload-safe, and deep-linkable.
export function useDataViewUrlState() {
  const [location, navigate] = useLocation();
  const searchString = useSearch();

  // The URL is the deep-link input: parse it once on mount (e.g. arriving
  // via a deck card's interviews link). After that, state flows one way —
  // state → URL — in the effect below.
  const [initialUrlState] = useState(() => parseDataViewSearch(searchString));
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(
    initialUrlState.columnFilters,
  );
  const [globalFilter, setGlobalFilter] = useState(
    initialUrlState.globalFilter,
  );
  const [sorting, setSorting] = useState<SortingState>(initialUrlState.sorting);

  // Mirror sort + filter state into the query string so the view is
  // shareable and survives a reload. Replace rather than push: filter tweaks
  // shouldn't pile up history entries. searchString is a dependency so an
  // outside navigation to a different query (e.g. re-clicking the Data tab,
  // which goes to a bare /data) gets the state re-imposed on the URL. The
  // location guard keeps the exit animation (the view stays mounted briefly
  // after navigating away) from yanking the URL back to /data.
  useEffect(() => {
    if (location !== '/data') return;
    const search = serializeDataViewState({
      globalFilter,
      columnFilters,
      sorting,
    });
    // Skip the no-op replace when the URL already encodes this state (the
    // common case for the run this effect triggers via its own navigation).
    const current = searchString.startsWith('?')
      ? searchString.slice(1)
      : searchString;
    if (current === search) return;
    navigate(search.length > 0 ? `/data?${search}` : '/data', {
      replace: true,
    });
  }, [columnFilters, globalFilter, sorting, location, navigate, searchString]);

  return {
    columnFilters,
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
    sorting,
    setSorting,
  };
}
