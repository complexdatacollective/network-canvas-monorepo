import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from '@tanstack/react-table';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { querySessions } from '~/lib/db/api';
import type {
  SessionQueryParams,
  SessionSortColumn,
  StoredSessionLite,
} from '~/lib/db/types';

import {
  readBoolean,
  readDateRange,
  readStatusArray,
  readString,
  readStringArray,
  SORT_COLUMN_BY_ID,
} from './dataViewUrlState';

const DEFAULT_PAGE_SIZE = 25;

export type SessionStatusCounts = {
  all: number;
  inProgress: number;
  complete: number;
};

type SessionQueryData = {
  rows: StoredSessionLite[];
  totalCount: number;
  statusCounts: SessionStatusCounts;
};

// Owns the server side of the table: derives SessionQueryParams from the
// table state, runs the (re-)query with a stale-response guard, and owns
// pagination — including the reset to page 0 when the filters change.
export function useSessionQuery({
  columnFilters,
  globalFilter,
  sorting,
  refreshKey,
}: {
  columnFilters: ColumnFiltersState;
  globalFilter: string;
  sorting: SortingState;
  // Bumped by the parent when sessions change outside this view (e.g.
  // synthetic-data generation/deletion in Settings) so the table re-queries.
  refreshKey?: number;
}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [data, setData] = useState<SessionQueryData | null>(null);

  // Derive server query params from the UI state. Column filter values are
  // unknown by Tanstack contract; pull each one through a typed reader so we
  // don't need `as` casts.
  const queryParams = useMemo<SessionQueryParams>(() => {
    const filterValue = (id: string) =>
      columnFilters.find((f) => f.id === id)?.value;
    const sortEntry = sorting[0];
    const sortColumn: SessionSortColumn = sortEntry
      ? (SORT_COLUMN_BY_ID[sortEntry.id] ?? 'updatedAt')
      : 'updatedAt';
    const search = globalFilter.trim();
    const caseId = readString(filterValue('caseId')).trim();
    const protocolNames = readStringArray(filterValue('protocolName'));
    const startedRange = readDateRange(filterValue('startedAt'));
    const updatedRange = readDateRange(filterValue('updatedAt'));
    const statuses = readStatusArray(filterValue('progress'));
    const exported = readBoolean(filterValue('exportedAt'));
    return {
      search: search.length > 0 ? search : undefined,
      caseId: caseId.length > 0 ? caseId : undefined,
      protocolNames: protocolNames.length > 0 ? protocolNames : undefined,
      startedRange,
      updatedRange,
      statuses: statuses.length > 0 ? statuses : undefined,
      exported,
      sort: { column: sortColumn, direction: sortEntry?.desc ? 'desc' : 'asc' },
      page: pagination.pageIndex,
      pageSize: pagination.pageSize,
    };
  }, [columnFilters, globalFilter, sorting, pagination]);

  // The hash captures every filter (search/case/protocol/dates/status/export)
  // so consumers can react when the row set semantically shifts. Sort and
  // pagination changes are intentionally excluded: same rows, just
  // reordered/repaged.
  const filtersKey = useMemo(() => {
    const f = queryParams;
    return JSON.stringify({
      s: f.search ?? '',
      c: f.caseId ?? '',
      p: f.protocolNames ?? [],
      sr: f.startedRange ?? null,
      ur: f.updatedRange ?? null,
      st: f.statuses ?? [],
      e: f.exported ?? null,
    });
  }, [queryParams]);
  const previousFiltersKey = useRef(filtersKey);
  useEffect(() => {
    if (previousFiltersKey.current !== filtersKey) {
      previousFiltersKey.current = filtersKey;
      setPagination((prev) =>
        prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 },
      );
    }
  }, [filtersKey]);

  // Stale-response guard: a slow query mustn't overwrite a newer result.
  const requestIdRef = useRef(0);
  const reloadData = useCallback(async () => {
    const id = ++requestIdRef.current;
    const result = await querySessions(queryParams);
    if (id !== requestIdRef.current) return;
    setData(result);
  }, [queryParams]);

  useEffect(() => {
    void reloadData();
  }, [reloadData, refreshKey]);

  const rows: StoredSessionLite[] = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pageCount =
    pagination.pageSize > 0
      ? Math.max(1, Math.ceil(totalCount / pagination.pageSize))
      : 1;
  const statusCounts: SessionStatusCounts = data?.statusCounts ?? {
    all: 0,
    inProgress: 0,
    complete: 0,
  };
  const pageIds = useMemo(
    () => (data?.rows ?? []).map((r) => r.id),
    [data?.rows],
  );

  return {
    queryParams,
    filtersKey,
    pagination,
    setPagination,
    // null until the first query resolves, letting the table distinguish
    // "loading" from "no results".
    loaded: data !== null,
    rows,
    totalCount,
    pageCount,
    statusCounts,
    pageIds,
    reloadData,
  };
}
