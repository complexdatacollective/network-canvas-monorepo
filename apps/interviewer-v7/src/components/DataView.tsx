import {
  type Column,
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  Download,
  Filter as FilterIcon,
  Play,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import { DataTableFacetedFilter } from '@codaco/fresco-ui/DataTable/DataTableFacetedFilter';
import BooleanFilter from '@codaco/fresco-ui/DataTable/filters/BooleanFilter';
import DateFilter from '@codaco/fresco-ui/DataTable/filters/DateFilter';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { useToast } from '@codaco/fresco-ui/Toast';
import {
  deleteSessions,
  getSettings,
  markSessionsExported,
  queryMatchingSessionIds,
  querySessions,
  updateSettings,
} from '~/lib/db/api';
import type {
  ProtocolWithCounts,
  SessionQueryParams,
  SessionSortColumn,
  SessionStatusKind,
  StoredSessionLite,
} from '~/lib/db/types';
import {
  buildExportOptions,
  type ExportProgress,
  runExport,
} from '~/lib/export/exportSessions';
import { downloadBlob } from '~/lib/files/download';

type DataViewProps = {
  protocols: ProtocolWithCounts[];
  onReload: () => Promise<void>;
};

type ChipFilter = 'all' | 'in-progress' | 'complete';

type Selection =
  | { mode: 'none' }
  | { mode: 'page'; ids: Set<string> }
  | { mode: 'allMatching'; excluded: Set<string> };

const DEFAULT_PAGE_SIZE = 25;

function statusLabel(kind: SessionStatusKind): string {
  if (kind === 'in-progress') return 'In progress';
  if (kind === 'complete') return 'Complete';
  return 'Exported';
}

const CHIP_BASE =
  'rounded-sm inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-pill)] font-heading font-extrabold text-xs uppercase tracking-[0.08em]';

function statusChipClass(kind: SessionStatusKind): string {
  if (kind === 'in-progress') return `${CHIP_BASE} bg-mustard/22 text-mustard`;
  if (kind === 'complete') return `${CHIP_BASE} bg-sea-green/22 text-sea-green`;
  return `${CHIP_BASE} bg-cerulean/22 text-cerulean`;
}

const FILTER_PILL_BASE =
  'relative px-[18px] py-2.5 border-0 rounded-full cursor-pointer font-heading font-extrabold text-xs tracking-[0.06em] uppercase transition-colors bg-transparent';

const STATUS_OPTIONS = [
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'exported', label: 'Exported' },
];

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      when: 'beforeChildren',
      delayChildren: 0.05,
      staggerChildren: 0.6,
    },
  },
  exit: {
    transition: {
      when: 'afterChildren',
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
} as const;

const toolbarVariants = {
  hidden: { opacity: 0, y: -8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      when: 'beforeChildren',
      staggerChildren: 0.06,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.2,
      when: 'afterChildren',
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
} as const;

const toolbarItemVariants = {
  hidden: { opacity: 0, scale: 0.92, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 320, damping: 24 },
  },
  exit: {
    opacity: 0,
    scale: 0.92,
    y: -4,
    transition: { duration: 0.2 },
  },
} as const;

const tableVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 240, damping: 28 },
  },
  exit: {
    opacity: 0,
    y: 16,
    transition: { duration: 0.25 },
  },
} as const;

const noopExportEvent = (_event: ExportProgress) => {};

const bannerVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.2 },
  },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15 } },
} as const;

function readDateRange(
  value: unknown,
): { from: string; to: string } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('from' in value) || !('to' in value)) return undefined;
  if (typeof value.from !== 'string' || typeof value.to !== 'string') {
    return undefined;
  }
  return { from: value.from, to: value.to };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function readStatusArray(value: unknown): SessionStatusKind[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is SessionStatusKind =>
      v === 'in-progress' || v === 'complete' || v === 'exported',
  );
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

// Tanstack column IDs use 'updatedAt'/'exportedAt' for ergonomics; the server
// column names need 'updatedAt'/'exportedAt' too — they happen to match here,
// so the mapping is direct.
const SORT_COLUMN_BY_ID: Record<string, SessionSortColumn> = {
  caseId: 'caseId',
  protocolName: 'protocolName',
  startedAt: 'startedAt',
  updatedAt: 'updatedAt',
  progress: 'progress',
  status: 'status',
  exportedAt: 'exportedAt',
};

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

function SortHeader<TData>({
  column,
  title,
}: {
  column: Column<TData>;
  title: string;
}) {
  const sortDir = column.getIsSorted();
  const isActive = sortDir !== false;
  return (
    <Button
      size="sm"
      variant={isActive ? 'default' : 'text'}
      color={isActive ? 'primary' : 'dynamic'}
      iconPosition="right"
      icon={
        sortDir ? (
          <motion.span
            initial={false}
            animate={{ rotate: sortDir === 'asc' ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22 }}
            className="inline-flex"
          >
            <ArrowDown size={14} aria-hidden />
          </motion.span>
        ) : undefined
      }
      onClick={() => column.toggleSorting()}
      className="-mx-4 min-w-max px-4! text-base"
    >
      {title}
    </Button>
  );
}

export function DataView({ protocols, onReload }: DataViewProps) {
  const protocolStageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const protocol of protocols) {
      map.set(protocol.hash, protocol.protocol.stages?.length ?? 0);
    }
    return map;
  }, [protocols]);

  const toast = useToast();
  const dialog = useDialog();
  const [, navigate] = useLocation();
  const [selection, setSelection] = useState<Selection>({ mode: 'none' });
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true },
  ]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  const [data, setData] = useState<{
    rows: StoredSessionLite[];
    totalCount: number;
    statusCounts: { all: number; inProgress: number; complete: number };
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

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
    const statuses = readStatusArray(filterValue('status'));
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

  // The hash captures every filter (search/case/protocol/dates/status/export);
  // when it changes we reset selection — the row set semantically shifts.
  // Sort and pagination changes are intentionally excluded: same rows, just
  // reordered/repaged, so the selection still means what it did.
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
      setSelection({ mode: 'none' });
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
  }, [reloadData]);

  const rows: StoredSessionLite[] = data?.rows ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pageCount =
    pagination.pageSize > 0
      ? Math.max(1, Math.ceil(totalCount / pagination.pageSize))
      : 1;

  const pageIds = useMemo(
    () => (data?.rows ?? []).map((r) => r.id),
    [data?.rows],
  );
  const allOnPageSelected =
    rows.length > 0 && pageIds.every((id) => isRowSelected(selection, id));
  const someOnPageSelected =
    !allOnPageSelected && pageIds.some((id) => isRowSelected(selection, id));

  const columns = useMemo<ColumnDef<StoredSessionLite>[]>(
    () => [
      {
        id: 'select',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        header: () => (
          <Checkbox
            size="sm"
            aria-label="Select all interviews on this page"
            checked={allOnPageSelected}
            indeterminate={someOnPageSelected}
            onCheckedChange={() => {
              setSelection((prev) =>
                toggleAllOnPage(prev, pageIds, allOnPageSelected),
              );
            }}
          />
        ),
        cell: ({ row }) => {
          const id = row.original.id;
          const checked = isRowSelected(selection, id);
          return (
            <Checkbox
              size="sm"
              aria-label={`Select ${row.original.caseId}`}
              checked={checked}
              onCheckedChange={() => {
                setSelection((prev) => toggleRow(prev, id));
              }}
            />
          );
        },
      },
      {
        id: 'caseId',
        accessorKey: 'caseId',
        header: ({ column }) => <SortHeader column={column} title="Case ID" />,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="font-monospace text-xs font-bold">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'protocolName',
        accessorKey: 'protocolName',
        header: ({ column }) => <SortHeader column={column} title="Protocol" />,
        enableSorting: true,
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="bg-sea-green h-2.5 w-2.5 rounded-full"
            />
            <span className="font-heading font-extrabold">
              {getValue<string>()}
            </span>
          </span>
        ),
      },
      {
        id: 'startedAt',
        accessorKey: 'startedAt',
        header: ({ column }) => <SortHeader column={column} title="Started" />,
        enableSorting: true,
        cell: ({ getValue }) => <TimeAgo date={getValue<string>()} />,
      },
      {
        id: 'updatedAt',
        accessorKey: 'lastUpdatedAt',
        header: ({ column }) => <SortHeader column={column} title="Updated" />,
        enableSorting: true,
        cell: ({ getValue }) => <TimeAgo date={getValue<string>()} />,
      },
      {
        id: 'progress',
        header: ({ column }) => <SortHeader column={column} title="Progress" />,
        enableSorting: true,
        enableColumnFilter: false,
        cell: ({ row }) => {
          const session = row.original;
          const totalStages =
            protocolStageCounts.get(session.protocolHash) ?? 0;
          const percent = session.progressPercent;
          return (
            <div className="flex items-center gap-2">
              <div className="w-24">
                <ProgressBar
                  nudge={false}
                  orientation="horizontal"
                  percentProgress={percent}
                  label={`step ${session.currentStep + 1} of ${totalStages || '?'}`}
                />
              </div>
              <span className="font-monospace text-text/60 text-xs tabular-nums">
                {Math.round(percent)}%
              </span>
            </div>
          );
        },
      },
      {
        id: 'status',
        header: ({ column }) => <SortHeader column={column} title="Status" />,
        enableSorting: true,
        cell: ({ row }) => {
          const kind = row.original.statusKind;
          return (
            <span className={statusChipClass(kind)}>{statusLabel(kind)}</span>
          );
        },
      },
      {
        id: 'exportedAt',
        accessorKey: 'exportedAt',
        header: ({ column }) => (
          <SortHeader column={column} title="Export status" />
        ),
        enableSorting: true,
        cell: ({ getValue }) => {
          const value = getValue<string | null>();
          return value ? (
            <TimeAgo date={value} />
          ) : (
            <span className="text-text/60 text-xs">Not exported</span>
          );
        },
      },
      {
        id: 'resume',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        header: () => <span className="sr-only">Resume</span>,
        cell: ({ row }) => {
          if (row.original.statusKind !== 'in-progress') return null;
          const id = row.original.id;
          return (
            <Button
              size="sm"
              variant="text"
              color="primary"
              icon={<Play size={14} strokeWidth={2.5} aria-hidden />}
              onClick={() => {
                void updateSettings({ lastActiveSessionId: id }).then(() =>
                  navigate(`/interview/${id}`),
                );
              }}
            >
              Resume
            </Button>
          );
        },
      },
    ],
    [
      allOnPageSelected,
      someOnPageSelected,
      pageIds,
      selection,
      protocolStageCounts,
      navigate,
    ],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnFilters, globalFilter, sorting, pagination },
    getRowId: (row) => row.id,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    pageCount,
    rowCount: totalCount,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
  });

  const statusCounts = data?.statusCounts ?? {
    all: 0,
    inProgress: 0,
    complete: 0,
  };

  const protocolOptions = useMemo(() => {
    const names = protocols
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    const seen = new Set<string>(names);
    return Array.from(seen)
      .toSorted((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [protocols]);

  const statusFilterValue = readStatusArray(
    table.getColumn('status')?.getFilterValue(),
  );
  const chipFilter: ChipFilter | null = useMemo(() => {
    if (statusFilterValue.length === 0) return 'all';
    if (
      statusFilterValue.length === 1 &&
      statusFilterValue[0] === 'in-progress'
    ) {
      return 'in-progress';
    }
    if (
      statusFilterValue.length === 2 &&
      statusFilterValue.includes('complete') &&
      statusFilterValue.includes('exported')
    ) {
      return 'complete';
    }
    return null;
  }, [statusFilterValue]);

  const setChipFilter = (next: ChipFilter) => {
    const statusColumn = table.getColumn('status');
    if (!statusColumn) return;
    if (next === 'all') statusColumn.setFilterValue(undefined);
    else if (next === 'in-progress')
      statusColumn.setFilterValue(['in-progress']);
    else statusColumn.setFilterValue(['complete', 'exported']);
  };

  const chipOptions: { id: ChipFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: statusCounts.all },
    {
      id: 'in-progress',
      label: 'In progress',
      count: statusCounts.inProgress,
    },
    { id: 'complete', label: 'Complete', count: statusCounts.complete },
  ];

  const caseIdRawFilter = table.getColumn('caseId')?.getFilterValue();
  const caseIdColumnFilter =
    typeof caseIdRawFilter === 'string' ? caseIdRawFilter : '';
  const startedAtColumnFilter = readDateRange(
    table.getColumn('startedAt')?.getFilterValue(),
  );
  const updatedAtColumnFilter = readDateRange(
    table.getColumn('updatedAt')?.getFilterValue(),
  );
  const exportedColumnFilter = readBoolean(
    table.getColumn('exportedAt')?.getFilterValue(),
  );

  const selectedCount = selectionCount(selection, totalCount);
  // The banner appears when the user has filled the visible page and there
  // are still more matching rows beyond it — offering the upgrade to
  // filter-wide selection. It also stays visible while in allMatching mode
  // so the user can see and clear the wide selection.
  const showSelectAllPrompt =
    selection.mode === 'page' &&
    allOnPageSelected &&
    rows.length > 0 &&
    totalCount > rows.length;
  const showBanner = showSelectAllPrompt || selection.mode === 'allMatching';

  const expandSelectionToAll = () => {
    setSelection({ mode: 'allMatching', excluded: new Set() });
  };
  const clearSelection = () => setSelection({ mode: 'none' });

  const resolveSelectedIds = useCallback(async (): Promise<string[]> => {
    if (selection.mode === 'none') return [];
    if (selection.mode === 'page') return Array.from(selection.ids);
    const ids = await queryMatchingSessionIds(queryParams);
    return ids.filter((id) => !selection.excluded.has(id));
  }, [selection, queryParams]);

  const handleExport = useCallback(async () => {
    if (selectedCount === 0 || exporting) return;
    setExporting(true);
    try {
      const ids = await resolveSelectedIds();
      if (ids.length === 0) {
        setExporting(false);
        return;
      }
      const settings = await getSettings();
      const options = buildExportOptions({
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        useScreenLayoutCoordinates: settings.useScreenLayoutCoordinates,
        screenLayoutHeight: settings.screenLayoutHeight,
        screenLayoutWidth: settings.screenLayoutWidth,
      });
      const { result, blob, fileName } = await runExport({
        options,
        sessionIds: ids,
        onEvent: noopExportEvent,
      });
      if (!blob || !fileName) {
        throw new Error('Export produced no file');
      }
      const download = await downloadBlob(blob, fileName);
      if (!download.saved) {
        toast.add({
          title: 'Export canceled',
          description: 'The archive was not saved.',
        });
        return;
      }
      await markSessionsExported(
        result.successfulExports.map((s) => s.sessionId),
      );
      if (result.failedExports.length > 0) {
        toast.add({
          title: 'Export completed with errors',
          description: `${result.failedExports.length} session(s) failed.`,
          variant: 'destructive',
        });
      } else {
        toast.add({
          title: 'Export complete',
          description: fileName,
          variant: 'success',
        });
      }
      setSelection({ mode: 'none' });
      await Promise.all([onReload(), reloadData()]);
    } catch (cause) {
      toast.add({
        title: 'Export failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [
    exporting,
    onReload,
    reloadData,
    resolveSelectedIds,
    selectedCount,
    toast,
  ]);

  const handleDelete = useCallback(async () => {
    if (selectedCount === 0 || deleting) return;
    const noun = selectedCount === 1 ? 'interview' : 'interviews';
    const confirmed = await dialog.openDialog({
      type: 'choice',
      title: `Delete ${selectedCount} ${noun}?`,
      description: `${selectedCount === 1 ? 'This record' : 'These records'} will be permanently removed from this device. This cannot be undone.`,
      intent: 'destructive',
      actions: {
        primary: { label: 'Delete', value: true },
        cancel: { label: 'Cancel', value: false },
      },
    });
    if (confirmed !== true) return;
    setDeleting(true);
    try {
      const ids = await resolveSelectedIds();
      if (ids.length === 0) return;
      await deleteSessions(ids);
      toast.add({
        title: `Deleted ${ids.length} ${ids.length === 1 ? 'interview' : 'interviews'}`,
        variant: 'success',
      });
      setSelection({ mode: 'none' });
      await Promise.all([onReload(), reloadData()]);
    } catch (cause) {
      toast.add({
        title: 'Delete failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [
    deleting,
    dialog,
    onReload,
    reloadData,
    resolveSelectedIds,
    selectedCount,
    toast,
  ]);

  const isFilterActive = columnFilters.length > 0;

  const toolbar = (
    <motion.div
      variants={toolbarVariants}
      className="flex flex-wrap items-center gap-2.5"
    >
      <motion.div
        variants={toolbarItemVariants}
        className="bg-surface inline-flex items-center rounded-full p-1"
        role="tablist"
        aria-label="Status filter"
      >
        {chipOptions.map((option) => {
          const active = chipFilter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setChipFilter(option.id)}
              className={`${FILTER_PILL_BASE} ${
                active ? 'text-primary-contrast' : 'text-text/80'
              }`}
            >
              {active ? (
                <motion.span
                  layoutId="data-view-status-indicator"
                  aria-hidden
                  className="bg-sea-green absolute inset-0 rounded-full"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              ) : null}
              <span className="relative">
                {option.label} · {option.count}
              </span>
            </button>
          );
        })}
      </motion.div>
      <div className="flex-1" />
      <motion.div variants={toolbarItemVariants}>
        <InputField
          type="search"
          name="data-view-search"
          size="md"
          prefixComponent={<Search />}
          value={globalFilter}
          onChange={(next) => setGlobalFilter(next ?? '')}
          placeholder="Search case ID or protocol..."
          aria-label="Search case ID or protocol"
          className="h-12 min-w-[260px]"
        />
      </motion.div>

      <motion.div variants={toolbarItemVariants}>
        <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
          <PopoverTrigger
            render={
              <Button
                size="md"
                color={isFilterActive ? 'primary' : 'default'}
                icon={<FilterIcon size={14} strokeWidth={2.5} aria-hidden />}
                aria-pressed={isFilterActive}
              >
                Filter
                {isFilterActive ? ` · ${columnFilters.length}` : ''}
              </Button>
            }
            nativeButton
          />
          <PopoverContent align="end" className="w-md">
            <div className="flex w-full flex-col gap-4 p-1">
              <div className="font-heading text-text/60 text-xs font-extrabold tracking-widest uppercase">
                Filters
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">Case ID</div>
                <InputField
                  type="text"
                  name="filter-case-id"
                  size="sm"
                  value={caseIdColumnFilter}
                  placeholder="Match by Case ID..."
                  onChange={(next) =>
                    table.getColumn('caseId')?.setFilterValue(next ?? '')
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">Protocol</div>
                <DataTableFacetedFilter
                  column={table.getColumn('protocolName')}
                  title="Protocol"
                  options={protocolOptions}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">Started</div>
                <DateFilter
                  value={startedAtColumnFilter}
                  onChange={(next) =>
                    table.getColumn('startedAt')?.setFilterValue(next)
                  }
                  config={{ type: 'date' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">Updated</div>
                <DateFilter
                  value={updatedAtColumnFilter}
                  onChange={(next) =>
                    table.getColumn('updatedAt')?.setFilterValue(next)
                  }
                  config={{ type: 'date' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">Status</div>
                <DataTableFacetedFilter
                  column={table.getColumn('status')}
                  title="Status"
                  options={STATUS_OPTIONS}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">
                  Export status
                </div>
                <BooleanFilter
                  value={exportedColumnFilter}
                  onChange={(next) =>
                    table.getColumn('exportedAt')?.setFilterValue(next)
                  }
                  config={{
                    type: 'boolean',
                    trueLabel: 'Exported',
                    falseLabel: 'Not exported',
                  }}
                />
              </div>

              <Button
                variant="text"
                size="sm"
                onClick={() => table.resetColumnFilters()}
                disabled={columnFilters.length === 0}
              >
                Clear all filters
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </motion.div>

      {selectedCount > 0 ? (
        <>
          <motion.div variants={toolbarItemVariants}>
            <Button
              color="destructive"
              size="md"
              icon={<Trash2 aria-hidden />}
              onClick={() => void handleDelete()}
              disabled={deleting || exporting}
            >
              {deleting ? 'Deleting…' : `Delete ${selectedCount} selected`}
            </Button>
          </motion.div>
          <motion.div variants={toolbarItemVariants}>
            <Button
              color="primary"
              size="md"
              icon={<Download aria-hidden />}
              onClick={() => void handleExport()}
              disabled={exporting || deleting}
            >
              {exporting ? 'Exporting…' : `Export ${selectedCount} selected`}
            </Button>
          </motion.div>
        </>
      ) : null}
    </motion.div>
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex min-h-0 w-full flex-1 flex-col gap-6 px-11 pt-8 pb-8"
    >
      {toolbar}

      <AnimatePresence initial={false}>
        {showBanner ? (
          <motion.div
            key="select-all-banner"
            variants={bannerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="bg-sea-green/10 text-text overflow-hidden rounded-lg"
          >
            <div className="font-heading flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              {selection.mode === 'allMatching' ? (
                <>
                  <span>
                    All <strong>{selectedCount}</strong> matching interviews are
                    selected.
                  </span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-sea-green inline-flex items-center gap-1 font-extrabold tracking-wide uppercase hover:underline"
                  >
                    <X size={14} aria-hidden />
                    Clear selection
                  </button>
                </>
              ) : (
                <>
                  <span>
                    All <strong>{rows.length}</strong> on this page are
                    selected.
                  </span>
                  <button
                    type="button"
                    onClick={expandSelectionToAll}
                    className="text-sea-green font-extrabold tracking-wide uppercase hover:underline"
                  >
                    Select all {totalCount} matching →
                  </button>
                </>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        variants={tableVariants}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DataTable
          table={table}
          bodyScroll
          emptyText={
            data === null
              ? 'Loading interviews…'
              : isFilterActive || globalFilter.length > 0
                ? 'No interviews match this filter.'
                : 'No interviews recorded yet.'
          }
        />
      </motion.div>
    </motion.div>
  );
}
