import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type Row,
  type RowSelectionState,
  type SortingFn,
  type SortingState,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Check,
  Download,
  Filter as FilterIcon,
  Search,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useMemo, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import { DataTableFacetedFilter } from '@codaco/fresco-ui/DataTable/DataTableFacetedFilter';
import DateFilter from '@codaco/fresco-ui/DataTable/filters/DateFilter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@codaco/fresco-ui/DropdownMenu';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import { useToast } from '@codaco/fresco-ui/Toast';
import { getSettings, markSessionsExported } from '~/lib/db/api';
import type { StoredSession } from '~/lib/db/types';
import {
  buildExportOptions,
  type ExportProgress,
  runExport,
} from '~/lib/export/exportSessions';
import { downloadBlob } from '~/lib/files/download';

type DataViewProps = {
  sessions: StoredSession[];
  onReload: () => Promise<void>;
};

type StatusKind = 'in-progress' | 'complete' | 'exported';
type ChipFilter = 'all' | 'in-progress' | 'complete';

function getStatus(session: StoredSession): StatusKind {
  if (session.exportedAt) return 'exported';
  if (session.finishedAt) return 'complete';
  return 'in-progress';
}

function statusLabel(kind: StatusKind): string {
  switch (kind) {
    case 'in-progress':
      return 'In progress';
    case 'complete':
      return 'Complete';
    case 'exported':
      return 'Exported';
  }
}

const CHIP_BASE =
  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-pill)] font-heading font-extrabold text-xs uppercase tracking-[0.08em]';

function statusChipClass(kind: StatusKind): string {
  if (kind === 'in-progress') return `${CHIP_BASE} bg-mustard/22 text-mustard`;
  if (kind === 'complete') return `${CHIP_BASE} bg-sea-green/22 text-sea-green`;
  return `${CHIP_BASE} bg-cerulean/22 text-cerulean`;
}

const FILTER_PILL_BASE =
  'relative px-[18px] py-2.5 border-0 rounded-full cursor-pointer font-heading font-extrabold text-xs tracking-[0.06em] uppercase transition-colors bg-transparent';

const STATUS_ORDER: Record<StatusKind, number> = {
  'in-progress': 0,
  'complete': 1,
  'exported': 2,
};

const STATUS_OPTIONS = [
  { value: 'in-progress', label: 'In progress' },
  { value: 'complete', label: 'Complete' },
  { value: 'exported', label: 'Exported' },
];

const SORTABLE_COLUMNS: { id: string; label: string }[] = [
  { id: 'caseId', label: 'Case ID' },
  { id: 'protocolName', label: 'Protocol' },
  { id: 'startedAt', label: 'Started' },
  { id: 'status', label: 'Status' },
];

// Outer stagger between the toolbar (index 0) and the table (index 1).
// Set so the table only enters after the toolbar's inner item cascade
// has put all of its items on screen.
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

const globalSearchFilterFn: FilterFn<StoredSession> = (
  row,
  _columnId,
  filterValue,
) => {
  if (typeof filterValue !== 'string') return true;
  const q = filterValue.trim().toLowerCase();
  if (q.length === 0) return true;
  const { caseId, protocolName } = row.original;
  return (
    caseId.toLowerCase().includes(q) || protocolName.toLowerCase().includes(q)
  );
};

const caseIdFilterFn: FilterFn<StoredSession> = (row, _columnId, value) => {
  if (typeof value !== 'string') return true;
  const q = value.trim().toLowerCase();
  if (q.length === 0) return true;
  return row.original.caseId.toLowerCase().includes(q);
};

const protocolFilterFn: FilterFn<StoredSession> = (row, _columnId, value) => {
  if (!Array.isArray(value) || value.length === 0) return true;
  return value.includes(row.original.protocolName);
};

const startedAtFilterFn: FilterFn<StoredSession> = (row, _columnId, value) => {
  if (typeof value !== 'object' || value === null) return true;
  const from =
    'from' in value && typeof value.from === 'string' ? value.from : null;
  const to = 'to' in value && typeof value.to === 'string' ? value.to : null;
  if (!from || !to) return true;
  const rowDate = new Date(row.original.startedAt);
  if (Number.isNaN(rowDate.getTime())) return false;
  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  return rowDate >= fromDate && rowDate <= toDate;
};

const statusFilterFn: FilterFn<StoredSession> = (row, _columnId, value) => {
  if (!Array.isArray(value) || value.length === 0) return true;
  return value.includes(getStatus(row.original));
};

const statusSortFn: SortingFn<StoredSession> = (
  rowA: Row<StoredSession>,
  rowB: Row<StoredSession>,
) =>
  STATUS_ORDER[getStatus(rowA.original)] -
  STATUS_ORDER[getStatus(rowB.original)];

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

export function DataView({ sessions, onReload }: DataViewProps) {
  const toast = useToast();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'startedAt', desc: true },
  ]);
  const [exporting, setExporting] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  const columns = useMemo<ColumnDef<StoredSession>[]>(
    () => [
      {
        id: 'select',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        header: ({ table }) => {
          const allSelected = table.getIsAllRowsSelected();
          const someSelected = table.getIsSomeRowsSelected();
          return (
            <button
              type="button"
              aria-label="Select all interviews"
              aria-pressed={allSelected}
              onClick={() => table.toggleAllRowsSelected(!allSelected)}
              className={`text-primary-contrast inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md border-2 p-0 ${
                allSelected || someSelected
                  ? 'border-sea-green bg-sea-green'
                  : 'border-outline bg-transparent'
              }`}
            >
              {allSelected ? (
                <Check size={12} strokeWidth={3.4} aria-hidden />
              ) : someSelected ? (
                <span
                  aria-hidden
                  className="bg-primary-contrast h-[2px] w-2.5 rounded-full"
                />
              ) : null}
            </button>
          );
        },
        cell: ({ row }) => {
          const isSelected = row.getIsSelected();
          return (
            <button
              type="button"
              aria-label={`Select ${row.original.caseId}`}
              aria-pressed={isSelected}
              onClick={() => row.toggleSelected(!isSelected)}
              className={`text-primary-contrast inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md border-2 p-0 ${
                isSelected
                  ? 'border-sea-green bg-sea-green'
                  : 'border-outline bg-transparent'
              }`}
            >
              {isSelected ? (
                <Check size={12} strokeWidth={3.4} aria-hidden />
              ) : null}
            </button>
          );
        },
      },
      {
        id: 'caseId',
        accessorKey: 'caseId',
        header: 'Case ID',
        enableSorting: true,
        sortingFn: 'alphanumeric',
        filterFn: caseIdFilterFn,
        cell: ({ getValue }) => (
          <span className="font-monospace text-xs font-bold">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: 'protocolName',
        accessorKey: 'protocolName',
        header: 'Protocol',
        enableSorting: true,
        sortingFn: 'alphanumeric',
        filterFn: protocolFilterFn,
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
        header: 'Started',
        enableSorting: true,
        sortingFn: 'alphanumeric',
        enableGlobalFilter: false,
        filterFn: startedAtFilterFn,
        cell: ({ getValue }) => new Date(getValue<string>()).toLocaleString(),
      },
      {
        id: 'duration',
        header: 'Duration',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        cell: () => '—',
      },
      {
        id: 'progress',
        header: 'Progress',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <span className="font-monospace text-text/60 text-xs tracking-[0.02em]">
            step {row.original.currentStep + 1}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        sortingFn: statusSortFn,
        enableGlobalFilter: false,
        filterFn: statusFilterFn,
        cell: ({ row }) => {
          const kind = getStatus(row.original);
          return (
            <span className={statusChipClass(kind)}>{statusLabel(kind)}</span>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: sessions,
    columns,
    state: { rowSelection, columnFilters, globalFilter, sorting },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    globalFilterFn: globalSearchFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const counts = useMemo(() => {
    let inProgress = 0;
    let complete = 0;
    for (const session of sessions) {
      const kind = getStatus(session);
      if (kind === 'in-progress') inProgress += 1;
      else complete += 1;
    }
    return { all: sessions.length, inProgress, complete };
  }, [sessions]);

  const protocolOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const session of sessions) {
      if (session.protocolName) seen.add(session.protocolName);
    }
    return Array.from(seen)
      .toSorted((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [sessions]);

  const statusFilterValue = readStringArray(
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
    { id: 'all', label: 'All', count: counts.all },
    { id: 'in-progress', label: 'In progress', count: counts.inProgress },
    { id: 'complete', label: 'Complete', count: counts.complete },
  ];

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedIds = useMemo(
    () => selectedRows.map((row) => row.original.id),
    [selectedRows],
  );

  const activeSort = sorting[0];
  const activeSortLabel =
    SORTABLE_COLUMNS.find((c) => c.id === activeSort?.id)?.label ?? 'Started';

  const handleSortClick = (columnId: string) => {
    const current = sorting[0];
    if (current?.id === columnId) {
      setSorting([{ id: columnId, desc: !current.desc }]);
    } else {
      setSorting([{ id: columnId, desc: true }]);
    }
  };

  const caseIdRawFilter = table.getColumn('caseId')?.getFilterValue();
  const caseIdColumnFilter =
    typeof caseIdRawFilter === 'string' ? caseIdRawFilter : '';
  const startedAtColumnFilter = readDateRange(
    table.getColumn('startedAt')?.getFilterValue(),
  );

  const handleExport = useCallback(async () => {
    if (selectedIds.length === 0 || exporting) return;
    setExporting(true);
    try {
      const settings = await getSettings();
      const options = buildExportOptions({
        exportGraphML: settings.exportGraphML,
        exportCSV: settings.exportCSV,
        useScreenLayoutCoordinates: settings.useScreenLayoutCoordinates,
        screenLayoutHeight: settings.screenLayoutHeight,
        screenLayoutWidth: settings.screenLayoutWidth,
      });
      const onEvent = (_event: ExportProgress) => {};
      const { result, blob, fileName } = await runExport({
        options,
        sessionIds: selectedIds,
        onEvent,
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
      setRowSelection({});
      await onReload();
    } catch (cause) {
      toast.add({
        title: 'Export failed',
        description: cause instanceof Error ? cause.message : String(cause),
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  }, [exporting, onReload, selectedIds, toast]);

  const isSortActive = !(activeSort?.id === 'startedAt' && activeSort.desc);
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
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="md"
                color={isSortActive ? 'primary' : 'default'}
                icon={<ArrowDownUp size={14} strokeWidth={2.5} aria-hidden />}
              >
                Sort: {activeSortLabel} {activeSort?.desc ? '↓' : '↑'}
              </Button>
            }
            nativeButton
          />
          <DropdownMenuContent align="end">
            {SORTABLE_COLUMNS.map((option) => {
              const isActive = activeSort?.id === option.id;
              return (
                <DropdownMenuItem
                  key={option.id}
                  onClick={() => handleSortClick(option.id)}
                >
                  <span className="flex-1">{option.label}</span>
                  {isActive ? (
                    activeSort?.desc ? (
                      <ArrowDown size={14} aria-hidden />
                    ) : (
                      <ArrowUp size={14} aria-hidden />
                    )
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
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
          <PopoverContent align="end">
            <div className="flex w-72 flex-col gap-4 p-1">
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
                <div className="font-heading text-xs font-bold">Status</div>
                <DataTableFacetedFilter
                  column={table.getColumn('status')}
                  title="Status"
                  options={STATUS_OPTIONS}
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

      {selectedIds.length > 0 ? (
        <motion.div variants={toolbarItemVariants}>
          <Button
            color="primary"
            size="md"
            icon={<Download size={14} strokeWidth={2.5} aria-hidden />}
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : `Export ${selectedIds.length} selected`}
          </Button>
        </motion.div>
      ) : null}
    </motion.div>
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-y-auto px-11 pt-8 pb-8"
    >
      {toolbar}
      <motion.div variants={tableVariants}>
        <DataTable
          table={table}
          showPagination={false}
          emptyText={
            sessions.length === 0
              ? 'No interviews recorded yet.'
              : 'No interviews match this filter.'
          }
        />
      </motion.div>
    </motion.div>
  );
}
