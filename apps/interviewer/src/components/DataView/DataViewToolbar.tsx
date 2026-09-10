import type { Table } from '@tanstack/react-table';
import { Download, Filter as FilterIcon, Search, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
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

const messages = defineMessages({
  all: {
    id: 'interviewer.dataViewToolbar.all',
    defaultMessage: 'All',
    description:
      'Filter option that includes interviews in every completion state.',
  },
  inProgress: {
    id: 'interviewer.dataViewToolbar.inProgress',
    defaultMessage: 'In progress',
    description: 'User-facing message in Interviewer Data View Toolbar.',
  },
  complete: {
    id: 'interviewer.dataViewToolbar.complete',
    defaultMessage: 'Complete',
    description:
      'Filter option for interviews marked finished; this is a state, not an instruction to complete a task.',
  },
  statusFilter: {
    id: 'interviewer.dataViewToolbar.statusFilter',
    defaultMessage: 'Status filter',
    description: 'The aria-label label in Interviewer Data View Toolbar.',
  },
  searchCaseIDOrProtocol: {
    id: 'interviewer.dataViewToolbar.searchCaseIDOrProtocol',
    defaultMessage: 'Search case ID or protocol...',
    description: 'The placeholder label in Interviewer Data View Toolbar.',
  },
  searchCaseIDOrProtocol2: {
    id: 'interviewer.dataViewToolbar.searchCaseIDOrProtocol2',
    defaultMessage: 'Search case ID or protocol',
    description: 'The aria-label label in Interviewer Data View Toolbar.',
  },
  filters: {
    id: 'interviewer.dataViewToolbar.filters',
    defaultMessage: 'Filters',
    description: 'Visible copy in Interviewer Data View Toolbar.',
  },
  caseID: {
    id: 'interviewer.dataViewToolbar.caseID',
    defaultMessage: 'Case ID',
    description: 'Visible copy in Interviewer Data View Toolbar.',
  },
  matchByCaseID: {
    id: 'interviewer.dataViewToolbar.matchByCaseID',
    defaultMessage: 'Match by Case ID...',
    description: 'The placeholder label in Interviewer Data View Toolbar.',
  },
  protocol: {
    id: 'interviewer.dataViewToolbar.protocol',
    defaultMessage: 'Protocol',
    description: 'Filter field selecting an installed research protocol.',
  },
  started: {
    id: 'interviewer.dataViewToolbar.started',
    defaultMessage: 'Started',
    description: 'Date filter for when an interview first began.',
  },
  updated: {
    id: 'interviewer.dataViewToolbar.updated',
    defaultMessage: 'Updated',
    description: 'Date filter for the most recent change to an interview.',
  },
  exportStatus: {
    id: 'interviewer.dataViewToolbar.exportStatus',
    defaultMessage: 'Export status',
    description: 'Visible copy in Interviewer Data View Toolbar.',
  },
  clearAllFilters: {
    id: 'interviewer.dataViewToolbar.clearAllFilters',
    defaultMessage: 'Clear all filters',
    description: 'Visible copy in Interviewer Data View Toolbar.',
  },
  deleting: {
    id: 'interviewer.dataViewToolbar.deleting',
    defaultMessage: 'Deleting…',
    description: 'User-facing message in Interviewer Data View Toolbar.',
  },
  exporting: {
    id: 'interviewer.dataViewToolbar.exporting',
    defaultMessage: 'Exporting…',
    description: 'User-facing message in Interviewer Data View Toolbar.',
  },
  exported: {
    id: 'interviewer.dataViewToolbar.exported',
    defaultMessage: 'Exported',
    description: 'User-facing message in Interviewer Data View Toolbar.',
  },
  notExported: {
    id: 'interviewer.dataViewToolbar.notExported',
    defaultMessage: 'Not exported',
    description: 'User-facing message in Interviewer Data View Toolbar.',
  },
  filterCount: {
    id: 'interviewer.dataViewToolbar.filterCount',
    defaultMessage: '{count, plural, =0 {Filter} other {Filter · #}}',
    description: 'Administration text in Interviewer DataViewToolbar.',
  },
  deleteSelected: {
    id: 'interviewer.dataViewToolbar.deleteSelected',
    defaultMessage: 'Delete {count, number} selected',
    description: 'Administration text in Interviewer DataViewToolbar.',
  },
  exportSelected: {
    id: 'interviewer.dataViewToolbar.exportSelected',
    defaultMessage: 'Export {count, number} selected',
    description: 'Administration text in Interviewer DataViewToolbar.',
  },
  statusCount: {
    id: 'interviewer.dataViewToolbar.statusCount',
    defaultMessage: '{label} · {count, number}',
    description: 'Administration text in Interviewer DataViewToolbar.',
  },
});

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
  onExport,
  onDelete,
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
  onExport: () => void;
  onDelete: () => void;
}) {
  const intl = useAppIntl();
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
    {
      id: 'all',
      label: intl.formatMessage(messages.all),
      count: statusCounts.all,
    },
    {
      id: 'in-progress',
      label: intl.formatMessage(messages.inProgress),
      count: statusCounts.inProgress,
    },
    {
      id: 'complete',
      label: intl.formatMessage(messages.complete),
      count: statusCounts.complete,
    },
  ];

  const statusOptions: SegmentedOption<ChipFilter>[] = chipOptions.map(
    (option) => ({
      value: option.id,
      label: (
        <>
          {intl.formatMessage(messages.statusCount, {
            label: option.label,
            count: option.count,
          })}
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
          aria-label={intl.formatMessage(messages.statusFilter)}
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
          data-testid="data-search"
          size="md"
          prefixComponent={<Search />}
          value={globalFilter}
          onChange={(next) => onGlobalFilterChange(next ?? '')}
          placeholder={intl.formatMessage(messages.searchCaseIDOrProtocol)}
          aria-label={intl.formatMessage(messages.searchCaseIDOrProtocol2)}
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
                // `selected`, not `aria-pressed`: PopoverTrigger already makes
                // this a disclosure (`aria-expanded`/`aria-haspopup`), and a
                // control must not also claim to be a toggle. That a filter is
                // active is carried by the visible "· N" count in the label.
                selected={isFilterActive}
                data-testid="data-filter-trigger"
              >
                {intl.formatMessage(messages.filterCount, {
                  count: columnFilters.length,
                })}
              </Button>
            }
            nativeButton
          />
          <PopoverContent align="end" className="w-md">
            <div className="flex w-full flex-col gap-4 p-1">
              <div className="font-heading text-text/60 text-xs font-extrabold tracking-widest uppercase">
                {intl.formatMessage(messages.filters)}
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">
                  {intl.formatMessage(messages.caseID)}
                </div>
                <InputField
                  type="text"
                  name="filter-case-id"
                  size="sm"
                  value={caseIdColumnFilter}
                  placeholder={intl.formatMessage(messages.matchByCaseID)}
                  onChange={(next) =>
                    table.getColumn('caseId')?.setFilterValue(next ?? '')
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">
                  {intl.formatMessage(messages.protocol)}
                </div>
                <DataTableFacetedFilter
                  column={table.getColumn('protocolName')}
                  title={intl.formatMessage(messages.protocol)}
                  options={protocolOptions}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">
                  {intl.formatMessage(messages.started)}
                </div>
                <DateFilter
                  value={startedAtColumnFilter}
                  onChange={(next) =>
                    table.getColumn('startedAt')?.setFilterValue(next)
                  }
                  config={{ type: 'date' }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="font-heading text-xs font-bold">
                  {intl.formatMessage(messages.updated)}
                </div>
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
                  {intl.formatMessage(messages.exportStatus)}
                </div>
                <BooleanFilter
                  value={exportedColumnFilter}
                  onChange={(next) =>
                    table.getColumn('exportedAt')?.setFilterValue(next)
                  }
                  config={{
                    type: 'boolean',
                    trueLabel: intl.formatMessage(messages.exported),
                    falseLabel: intl.formatMessage(messages.notExported),
                  }}
                />
              </div>

              <Button
                variant="text"
                size="sm"
                onClick={() => table.resetColumnFilters()}
                disabled={columnFilters.length === 0}
              >
                {intl.formatMessage(messages.clearAllFilters)}
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
              data-testid="data-delete"
            >
              {deleting
                ? intl.formatMessage(messages.deleting)
                : intl.formatMessage(messages.deleteSelected, {
                    count: selectedCount,
                  })}
            </Button>
          </motion.div>
          <motion.div variants={toolbarItemVariants}>
            <Button
              color="primary"
              size="md"
              icon={<Download aria-hidden />}
              onClick={onExport}
              disabled={exporting || deleting}
              data-testid="data-export"
            >
              {exporting
                ? intl.formatMessage(messages.exporting)
                : intl.formatMessage(messages.exportSelected, {
                    count: selectedCount,
                  })}
            </Button>
          </motion.div>
        </>
      ) : null}
    </motion.div>
  );
}
