# Data view pagination

Server-side pagination for the data view's session table, with filter-wide selection that survives non-visible rows and a viewport-bound layout.

## Why

Today `HomeRoute` fetches every session via `listSessions()` and passes the full array (including every `network` JSON blob) to `DataView`. The table filters/sorts/renders entirely client-side, with the whole page scrolling. This breaks down once a researcher has a meaningful number of sessions: memory grows with every network's nodes/edges, and the page becomes a long-scroll DOM.

The change pushes filter, sort, and paging into the DB layer; the renderer only ever holds the rows on the current page (plus their lightweight metadata). The table body scrolls inside a viewport-bound region; the page itself does not.

## Architecture overview

Three new query functions on `apps/interviewer-v7/src/lib/db/api.ts`:

1. `querySessions(params): Promise<{ rows, totalCount, statusCounts }>` — the paginated read.
2. `queryMatchingSessionIds(params): Promise<string[]>` — every ID matching the current filter set (no pagination), used when the user expands to "Select all N matching."
3. `listSessions()` keeps its signature but returns the new lightweight type. The full `StoredSession` (with `network`) still comes from `getSession` / `getSessionsByIds` for the interview engine and export pipeline.

`StoredSessionLite` is a new type — `StoredSession` minus `network` and `stageMetadata`, plus derived `statusKind` and `progressPercent` fields.

Progress is computed in the query. SQLite joins `protocols` and uses `json_array_length(json_extract(p.protocol_json, '$.stages'))`. Dexie fetches the protocols once per query and builds a hash→stageCount map.

## Query parameters

```ts
type QueryParams = {
  search?: string; // case ID OR protocol name LIKE
  caseId?: string; // case ID LIKE
  protocolNames?: string[]; // IN
  startedRange?: { from: string; to: string }; // BETWEEN
  updatedRange?: { from: string; to: string }; // BETWEEN
  statuses?: ('in-progress' | 'complete' | 'exported')[];
  exported?: boolean; // exportedAt IS [NOT] NULL
  sort: {
    column:
      | 'caseId'
      | 'protocolName'
      | 'startedAt'
      | 'updatedAt'
      | 'progress'
      | 'status'
      | 'exportedAt';
    direction: 'asc' | 'desc';
  };
  page: number;
  pageSize: number;
};
```

`statusCounts` returns `{ all, inProgress, complete }`, each computed over the same filter set **with the `statuses` predicate dropped**, so the chip totals say "this is how many rows you would see if you clicked this chip on top of your other filters." `complete` includes the `exported` substatus, matching the current chip semantics.

## Selection model

Tanstack's built-in `RowSelectionState` keys by row ID; it cannot represent "every row that matches the filter" without enumerating IDs. Replaced with a bespoke state in DataView:

```ts
type Selection =
  | { mode: 'none' }
  | { mode: 'page'; ids: Set<string> } // explicitly ticked IDs
  | { mode: 'allMatching'; excluded: Set<string> }; // every matching row minus exclusions
```

Header checkbox state:

- `'none'`, or `'page'` with no current-page IDs → unchecked.
- `'page'` with some-but-not-all of the current page → indeterminate.
- `'page'` with every current-page row selected → checked. Click unchecks (drops those IDs).
- `'allMatching'`, no exclusions on the current page → checked.
- `'allMatching'`, some exclusions on the current page → indeterminate.

A banner above the table appears when `mode === 'page'` and every current-page row is selected and `totalCount > pageSize`:

> "All {pageSize} on this page are selected. **Select all {totalCount} matching →**"

Clicking switches to `mode: 'allMatching'`. Banner then reads:

> "All {totalCount} matching are selected. **Clear selection**"

Selection resets to `'none'` when filters change. Page navigation does not clear selection — that is the entire point of `'allMatching'`.

The fresco-ui `Checkbox` component is used for both the header and row cells. The wrapper today only renders the check path; this spec extends it to render a horizontal-bar indicator when `indeterminate` is true (opt-in prop, backwards compatible).

## Layout

```
DataView (h-full, flex-col, gap-6, no overflow)
├── Toolbar              (shrink-0)
├── SelectionBanner      (shrink-0, AnimatePresence)
├── ScrollContainer      (flex-1, min-h-0, overflow-y-auto, rounded border)
│   └── <table>          (thead is sticky top-0, bg-surface-2, z-10)
└── DataTablePagination  (shrink-0)
```

`HomeRoute` is already `h-dvh flex-col overflow-hidden`; DataView just fills the available `flex-1`. The current `overflow-y-auto` on DataView's outer container is removed.

To keep the fresco-ui DataTable as the assembled primitive, add a `bodyScroll?: boolean` prop. When true:

- The outer wrapper becomes `h-full`.
- The scroll wrapper around the table becomes `flex-1 min-h-0 overflow-y-auto`.
- The thead row gets `sticky top-0 z-10` (background already comes from `bg-surface-2`).

`bodyScroll` defaults to `false` so other consumers are unaffected.

## Default and options

- Default page size: 25.
- Page size options: 10, 25, 50, 100.

`packages/fresco-ui/src/DataTable/types.ts` exports `pageSizes = [10, 20, 50, 100]`. The data view passes its own array via the existing fresco-ui pagination contract rather than mutating the shared default.

## Electron implementation (`electron/db/service.ts`)

Two new methods on the `sessions` object:

- `query(params)` — composes a single SQL statement with WHERE/ORDER/LIMIT; a `LEFT JOIN protocols p ON s.protocolHash = p.hash` provides stage counts via `json_array_length(json_extract(p.protocol_json, '$.stages'))`. The progress expression is `CASE WHEN s.finishedAt IS NOT NULL THEN 100.0 ELSE (s.currentStep * 100.0 / NULLIF(stageCount, 0)) END`. Status order is `CASE WHEN s.exportedAt IS NOT NULL THEN 2 WHEN s.finishedAt IS NOT NULL THEN 1 ELSE 0 END`. `network_json` and `stageMetadata_json` are excluded from the SELECT list. A second query, with the same filters minus `statuses`, groups by status_kind for the `statusCounts` payload — both queries share a single WHERE-builder helper to keep the predicates in sync.
- `queryMatchingIds(params)` — `SELECT id FROM sessions WHERE …` over the same filter set. No LIMIT, no ORDER, no JOIN — every current filter (status included) is expressible from session columns alone, and the IDs feed selection membership, not display order.

IPC plumbing:

- `electron/handlers/dbHandlers.ts` — register `db:sessions:query` and `db:sessions:queryMatchingIds`.
- `electron/preload.ts` — expose `sessions.query(params)` and `sessions.queryMatchingIds(params)`.
- `src/global.d.ts` — declare the new bridge methods (in lockstep with preload).

## Dexie implementation (`src/lib/db/sessions.ts`)

`querySessions` / `queryMatchingSessionIds` run filter + sort + slice in JS, because Dexie cannot push the combined predicate set (LIKE + IN + range + computed status) down to IndexedDB. Stage counts come from a one-shot `db.protocols.toArray()` per query. Network/stageMetadata are stripped before the result is built. This keeps Dexie callers cheap on the per-row size while still iterating the index for the predicate.

## Wiring changes

- `DataView` drops the `sessions` prop and owns its own data fetch via `querySessions`. A request-id ref guards against stale responses overwriting newer ones. Filter or sort changes reset `pageIndex` to 0 and `selection` to `'none'`.
- `Tanstack Table` is configured with `manualPagination`, `manualSorting`, `manualFiltering`, `rowCount`, `pageCount`. `getFilteredRowModel` / `getSortedRowModel` are dropped. Built-in row selection is disabled — the checkbox column reads and writes the bespoke `selection` state directly.
- `HomeRoute` stops passing `sessions` to DataView. `listSessions()` continues to power `ResumePill` and the protocol-delete confirmation; its callers only ever read metadata fields, so the lightweight type ripples through cleanly.
- `handleExport` resolves the effective ID list:
  - `'page'` → `Array.from(selection.ids)`.
  - `'allMatching'` → `(await queryMatchingSessionIds(params)).filter(id => !selection.excluded.has(id))`.
  - The rest of `runExport({ sessionIds, … })` is unchanged.

## Conventions notes

- No barrel files; every new symbol is imported from its source.
- No `any`, no `as` to suppress types.
- New code goes through the `src/lib/db/api.ts` facade — routes/components never branch on `isElectron`.
- Selection state is local to `DataView`; it is not lifted to a context.
- The fresco-ui `Checkbox` change is additive (opt-in `indeterminate` prop); no other consumers are touched.
