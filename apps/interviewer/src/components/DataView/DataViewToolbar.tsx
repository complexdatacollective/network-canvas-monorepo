import type { Table } from '@tanstack/react-table';
import { Download, Filter as FilterIcon, Search, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import { DataTableFacetedFilter } from '@codaco/fresco-ui/DataTable/DataTableFacetedFilter';
import BooleanFilter from '@codaco/fresco-ui/DataTable/filters/BooleanFilter';
import DateFilter from '@codaco/fresco-ui/DataTable/filters/DateFilter';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@codaco/fresco-ui/Popover';
import SegmentedSwitcher, {
  type SegmentedOption,
} from '@codaco/fresco-ui/SegmentedSwitcher';
import type { StoredSessionLite } from '~/lib/db/types';

import {
  readBoolean,
  readDateRange,
  readStatusArray,
} from './dataViewUrlState';
import type { SessionStatusCounts } from './useSessionQuery';

type ChipFilter = 'all' | 'in-progress' | 'complete';

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

// The table's command row: status chips, global search, the filter popover,
// and the bulk actions that appear once rows are selected. Filter state
// lives on the table; this component only renders and forwards it.
export function DataViewToolbar({
  table,
  globalFilter,
  onGlobalFilterChange,
  statusCounts,
  protocolOptions,
  selectedCount,
  exporting,
  deleting,
  pendingShare,
  onExport,
  onDelete,
  onShareReady,
}: {
  table: Table<StoredSessionLite>;
  // Passed explicitly rather than read from table.getState(): Tanstack
  // types globalFilter as `any`.
  globalFilter: string;
  onGlobalFilterChange: (next: string) => void;
  statusCounts: SessionStatusCounts;
  protocolOptions: { value: string; label: string }[];
  selectedCount: number;
  exporting: boolean;
  deleting: boolean;
  pendingShare: boolean;
  onExport: () => void;
  onDelete: () => void;
  onShareReady: () => void;
}) {
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);

  const columnFilters = table.getState().columnFilters;
  const isFilterActive = columnFilters.length > 0;

  const statusFilterValue = readStatusArray(
    table.getColumn('progress')?.getFilterValue(),
  );
  const chipFilter: ChipFilter | null = useMemo(() => {
    if (statusFilterValue.length === 0) return 'all';
    if (
      statusFilterValue.length === 1 &&
      statusFilterValue[0] === 'in-progress'
    ) {
      return 'in-progress';
    }
    if (statusFilterValue.length === 1 && statusFilterValue[0] === 'complete') {
      return 'complete';
    }
    return null;
  }, [statusFilterValue]);

  const setChipFilter = (next: ChipFilter) => {
    const progressColumn = table.getColumn('progress');
    if (!progressColumn) return;
    if (next === 'all') progressColumn.setFilterValue(undefined);
    else if (next === 'in-progress')
      progressColumn.setFilterValue(['in-progress']);
    else progressColumn.setFilterValue(['complete']);
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

  const statusOptions: SegmentedOption<ChipFilter>[] = chipOptions.map(
    (option) => ({
      value: option.id,
      label: (
        <>
          {option.label} · {option.count}
        </>
      ),
    }),
  );

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

  return (
    <motion.div
      variants={toolbarVariants}
      className="flex flex-wrap items-center gap-2.5"
    >
      <motion.div variants={toolbarItemVariants}>
        <SegmentedSwitcher
          aria-label="Status filter"
          size="md"
          variant="glass"
          value={chipFilter ?? 'all'}
          onValueChange={setChipFilter}
          options={statusOptions}
        />
      </motion.div>
      <div className="flex-1" />
      <motion.div variants={toolbarItemVariants}>
        <InputField
          type="search"
          name="data-view-search"
          size="md"
          prefixComponent={<Search />}
          value={globalFilter}
          onChange={(next) => onGlobalFilterChange(next ?? '')}
          placeholder="Search case ID or protocol..."
          aria-label="Search case ID or protocol"
          // `control-glass` applies the blur/border/shadow, but InputField paints
          // its own opaque `bg-input`; force the translucent glass fill over it.
          className="control-glass border-outline bg-surface/50! h-12 min-w-[260px]"
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
              onClick={onDelete}
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
              onClick={onExport}
              disabled={exporting || deleting}
            >
              {exporting ? 'Exporting…' : `Export ${selectedCount} selected`}
            </Button>
          </motion.div>
        </>
      ) : null}
      {pendingShare ? (
        <motion.div variants={toolbarItemVariants}>
          <Button
            color="primary"
            size="md"
            icon={<Download aria-hidden />}
            onClick={onShareReady}
          >
            Save export
          </Button>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
