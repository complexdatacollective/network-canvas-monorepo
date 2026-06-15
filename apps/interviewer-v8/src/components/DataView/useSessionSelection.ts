import { useCallback, useEffect, useRef, useState } from 'react';

import { queryMatchingSessionIds } from '~/lib/db/api';
import type { SessionQueryParams } from '~/lib/db/types';

// Selection over a server-paginated table can't be a flat id set: "all
// matching" must keep meaning every row the current filters match — even
// rows on pages that were never fetched — so it's stored as an exclusion
// list instead.
type Selection =
  | { mode: 'none' }
  | { mode: 'page'; ids: Set<string> }
  | { mode: 'allMatching'; excluded: Set<string> };

function isRowSelected(selection: Selection, id: string): boolean {
  if (selection.mode === 'none') return false;
  if (selection.mode === 'page') return selection.ids.has(id);
  return !selection.excluded.has(id);
}

function toggleRow(selection: Selection, id: string): Selection {
  if (selection.mode === 'allMatching') {
    const excluded = new Set(selection.excluded);
    if (excluded.has(id)) excluded.delete(id);
    else excluded.add(id);
    return { mode: 'allMatching', excluded };
  }
  if (selection.mode === 'page') {
    const ids = new Set(selection.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    if (ids.size === 0) return { mode: 'none' };
    return { mode: 'page', ids };
  }
  return { mode: 'page', ids: new Set([id]) };
}

function toggleAllOnPage(
  selection: Selection,
  pageIds: readonly string[],
  allSelectedOnPage: boolean,
): Selection {
  if (allSelectedOnPage) {
    if (selection.mode === 'allMatching') {
      const excluded = new Set(selection.excluded);
      for (const id of pageIds) excluded.add(id);
      return { mode: 'allMatching', excluded };
    }
    if (selection.mode === 'page') {
      const ids = new Set(selection.ids);
      for (const id of pageIds) ids.delete(id);
      if (ids.size === 0) return { mode: 'none' };
      return { mode: 'page', ids };
    }
    return { mode: 'none' };
  }
  if (selection.mode === 'allMatching') {
    const excluded = new Set(selection.excluded);
    for (const id of pageIds) excluded.delete(id);
    return { mode: 'allMatching', excluded };
  }
  const ids =
    selection.mode === 'page' ? new Set(selection.ids) : new Set<string>();
  for (const id of pageIds) ids.add(id);
  return { mode: 'page', ids };
}

function selectionCount(selection: Selection, totalCount: number): number {
  if (selection.mode === 'none') return 0;
  if (selection.mode === 'page') return selection.ids.size;
  return Math.max(0, totalCount - selection.excluded.size);
}

// Owns the table's row selection: per-row and per-page toggles, the upgrade
// to a filter-wide ("all matching") selection, and the reset when the
// filtered row set changes.
export function useSessionSelection({
  filtersKey,
  pageIds,
  totalCount,
  queryParams,
}: {
  filtersKey: string;
  pageIds: readonly string[];
  totalCount: number;
  queryParams: SessionQueryParams;
}) {
  const [selection, setSelection] = useState<Selection>({ mode: 'none' });

  // When the filters change the row set semantically shifts, so the
  // selection no longer means what the user intended — drop it. Sort and
  // pagination changes don't alter filtersKey: same rows, just
  // reordered/repaged, so the selection survives those.
  const previousFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (previousFiltersKey.current !== filtersKey) {
      previousFiltersKey.current = filtersKey;
      setSelection({ mode: 'none' });
    }
  }, [filtersKey]);

  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => isRowSelected(selection, id));
  const someOnPageSelected =
    !allOnPageSelected && pageIds.some((id) => isRowSelected(selection, id));
  const selectedCount = selectionCount(selection, totalCount);

  const isSelected = useCallback(
    (id: string) => isRowSelected(selection, id),
    [selection],
  );
  const toggleRowSelected = useCallback((id: string) => {
    setSelection((prev) => toggleRow(prev, id));
  }, []);
  const togglePageSelected = useCallback(() => {
    setSelection((prev) => toggleAllOnPage(prev, pageIds, allOnPageSelected));
  }, [pageIds, allOnPageSelected]);
  const expandSelectionToAll = useCallback(() => {
    setSelection({ mode: 'allMatching', excluded: new Set() });
  }, []);
  const clearSelection = useCallback(() => {
    setSelection({ mode: 'none' });
  }, []);

  // Materialize the selection into concrete session ids; the allMatching
  // mode needs a server round-trip for the full matching id list.
  const resolveSelectedIds = useCallback(async (): Promise<string[]> => {
    if (selection.mode === 'none') return [];
    if (selection.mode === 'page') return Array.from(selection.ids);
    const ids = await queryMatchingSessionIds(queryParams);
    return ids.filter((id) => !selection.excluded.has(id));
  }, [selection, queryParams]);

  // The prompt appears when the user has filled the visible page and there
  // are still more matching rows beyond it — offering the upgrade to
  // filter-wide selection. The banner also stays visible in allMatching
  // mode so the user can see and clear the wide selection.
  const showSelectAllPrompt =
    selection.mode === 'page' &&
    allOnPageSelected &&
    pageIds.length > 0 &&
    totalCount > pageIds.length;
  const isAllMatchingSelected = selection.mode === 'allMatching';
  const showBanner = showSelectAllPrompt || isAllMatchingSelected;

  return {
    isSelected,
    toggleRowSelected,
    togglePageSelected,
    expandSelectionToAll,
    clearSelection,
    resolveSelectedIds,
    allOnPageSelected,
    someOnPageSelected,
    selectedCount,
    isAllMatchingSelected,
    showBanner,
  };
}
