import type { ColumnFiltersState, SortingState } from '@tanstack/react-table';

import type { SessionSortColumn, SessionStatusKind } from '~/lib/db/types';

// The DataView table state that round-trips through the URL query string,
// making filtered/sorted views shareable and deep-linkable (e.g. the deck
// card's interviews link). Pagination is deliberately excluded: page indices
// go stale as sessions are added/deleted, so a deep link to page 3 of a
// past dataset would mislead.
export type DataViewUrlState = {
  globalFilter: string;
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
};

// Tanstack column IDs use 'updatedAt'/'exportedAt' for ergonomics; the server
// column names need 'updatedAt'/'exportedAt' too — they happen to match here,
// so the mapping is direct. Doubles as the allowlist for the `sort` query
// parameter.
export const SORT_COLUMN_BY_ID: Record<string, SessionSortColumn> = {
  caseId: 'caseId',
  protocolName: 'protocolName',
  startedAt: 'startedAt',
  updatedAt: 'updatedAt',
  progress: 'progress',
  exportedAt: 'exportedAt',
};

export const DEFAULT_SORTING: SortingState = [{ id: 'updatedAt', desc: true }];

// Filter values arrive as `unknown` from the Tanstack column-filter contract
// AND as raw strings from the URL; these readers narrow both without `as`
// casts. DataView imports them for its render-time reads so a value is
// interpreted identically everywhere.

export function readDateRange(
  value: unknown,
): { from: string; to: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('from' in value) || !('to' in value)) return undefined;
  if (typeof value.from !== 'string' || typeof value.to !== 'string') {
    return undefined;
  }
  return { from: value.from, to: value.to };
}

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function readStatusArray(value: unknown): SessionStatusKind[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is SessionStatusKind =>
      v === 'in-progress' || v === 'complete' || v === 'exported',
  );
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// DateFilter emits local YYYY-MM-DD strings; anything else in the URL is
// hand-edited garbage and the whole range is dropped (a range needs both
// ends to mean anything).
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readDateRangeParams(
  params: URLSearchParams,
  fromKey: string,
  toKey: string,
): { from: string; to: string } | undefined {
  const from = params.get(fromKey);
  const to = params.get(toKey);
  if (!from || !to) return undefined;
  if (!ISO_DATE_PATTERN.test(from) || !ISO_DATE_PATTERN.test(to)) {
    return undefined;
  }
  return { from, to };
}

// Parses a query string (with or without the leading '?') into table state.
// Unknown or malformed parameters are dropped rather than erroring — a URL
// is user-editable input.
export function parseDataViewSearch(search: string): DataViewUrlState {
  const params = new URLSearchParams(search);
  const columnFilters: ColumnFiltersState = [];

  const caseId = params.get('caseId');
  if (caseId) columnFilters.push({ id: 'caseId', value: caseId });

  const protocols = params.getAll('protocol').filter((p) => p.length > 0);
  if (protocols.length > 0) {
    columnFilters.push({ id: 'protocolName', value: protocols });
  }

  const started = readDateRangeParams(params, 'startedFrom', 'startedTo');
  if (started) columnFilters.push({ id: 'startedAt', value: started });

  const updated = readDateRangeParams(params, 'updatedFrom', 'updatedTo');
  if (updated) columnFilters.push({ id: 'updatedAt', value: updated });

  const statuses = readStatusArray(params.getAll('status'));
  if (statuses.length > 0) {
    columnFilters.push({ id: 'progress', value: statuses });
  }

  const exported = params.get('exported');
  if (exported === 'true' || exported === 'false') {
    columnFilters.push({ id: 'exportedAt', value: exported === 'true' });
  }

  const sortId = params.get('sort');
  const direction = params.get('dir');
  // Object.hasOwn, not `in`: the query string is user-controlled, and a
  // prototype key like `sort=toString` must not pass the allowlist.
  const sorting: SortingState =
    sortId && Object.hasOwn(SORT_COLUMN_BY_ID, sortId)
      ? [{ id: sortId, desc: direction !== 'asc' }]
      : DEFAULT_SORTING;

  return {
    globalFilter: params.get('q') ?? '',
    columnFilters,
    sorting,
  };
}

// Serializes table state to a query string ('' when everything is at its
// default, so the URL stays a bare /data). Inverse of parseDataViewSearch
// up to empty/whitespace-only filter values, which are treated as unset.
export function serializeDataViewState(state: DataViewUrlState): string {
  const params = new URLSearchParams();
  const filterValue = (id: string) =>
    state.columnFilters.find((f) => f.id === id)?.value;

  const search = state.globalFilter.trim();
  if (search.length > 0) params.set('q', search);

  const caseId = readString(filterValue('caseId')).trim();
  if (caseId.length > 0) params.set('caseId', caseId);

  for (const name of readStringArray(filterValue('protocolName'))) {
    params.append('protocol', name);
  }

  const started = readDateRange(filterValue('startedAt'));
  if (started) {
    params.set('startedFrom', started.from);
    params.set('startedTo', started.to);
  }

  const updated = readDateRange(filterValue('updatedAt'));
  if (updated) {
    params.set('updatedFrom', updated.from);
    params.set('updatedTo', updated.to);
  }

  for (const status of readStatusArray(filterValue('progress'))) {
    params.append('status', status);
  }

  const exported = readBoolean(filterValue('exportedAt'));
  if (exported !== undefined) params.set('exported', String(exported));

  const sortEntry = state.sorting[0];
  const defaultSort = DEFAULT_SORTING[0];
  if (
    sortEntry &&
    defaultSort &&
    Object.hasOwn(SORT_COLUMN_BY_ID, sortEntry.id) &&
    (sortEntry.id !== defaultSort.id || sortEntry.desc !== defaultSort.desc)
  ) {
    params.set('sort', sortEntry.id);
    params.set('dir', sortEntry.desc ? 'desc' : 'asc');
  }

  return params.toString();
}

// Deep link to the data view filtered to a single protocol's interviews
// (used by the deck card's interviews count).
export function protocolDataViewPath(protocolName: string | undefined): string {
  if (!protocolName) return '/data';
  const params = new URLSearchParams();
  params.set('protocol', protocolName);
  return `/data?${params.toString()}`;
}
