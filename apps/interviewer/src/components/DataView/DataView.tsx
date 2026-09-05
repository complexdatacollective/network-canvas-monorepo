import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import { DataTable } from '@codaco/fresco-ui/DataTable/DataTable';
import { getInterviewProgress } from '@codaco/interview';
import type { ProtocolWithCounts } from '~/lib/db/types';

import { DataViewToolbar } from './DataViewToolbar';
import { ExportDialog } from './ExportDialog';
import { useDataViewColumns } from './useDataViewColumns';
import { useDataViewUrlState } from './useDataViewUrlState';
import { useSessionMutations } from './useSessionMutations';
import { useSessionQuery } from './useSessionQuery';
import { useSessionSelection } from './useSessionSelection';

const messages = defineMessages({
  allStrongSelectedCountStrongMatchingInterviewsAre: {
    id: 'interviewer.dataView.allStrongSelectedCountStrongMatchingInterviewsAre',
    defaultMessage:
      '{selectedCount, plural, one {The <strong>#</strong> matching interview is selected.} other {All <strong>#</strong> matching interviews are selected.}}',
    description: 'Visible copy in Interviewer Data View.',
  },
  clearSelection: {
    id: 'interviewer.dataView.clearSelection',
    defaultMessage: 'Clear selection',
    description:
      'Action that deselects interviews without deleting or changing them.',
  },
  allStrongLengthStrongOnThisPage: {
    id: 'interviewer.dataView.allStrongLengthStrongOnThisPage',
    defaultMessage:
      '{length, plural, one {The <strong>#</strong> interview on this page is selected.} other {All <strong>#</strong> on this page are selected.}}',
    description: 'Visible copy in Interviewer Data View.',
  },
  selectAllTotalCountMatching: {
    id: 'interviewer.dataView.selectAllTotalCountMatching',
    defaultMessage:
      '{totalCount, plural, one {Select the # match →} other {Select all # matching →}}',
    description: 'Visible copy in Interviewer Data View.',
  },
  loadingInterviews: {
    id: 'interviewer.dataView.loadingInterviews',
    defaultMessage: 'Loading interviews…',
    description: 'User-facing message in Interviewer Data View.',
  },
  noInterviewsMatchThisFilter: {
    id: 'interviewer.dataView.noInterviewsMatchThisFilter',
    defaultMessage: 'No interviews match this filter.',
    description: 'User-facing message in Interviewer Data View.',
  },
  noInterviewsRecordedYet: {
    id: 'interviewer.dataView.noInterviewsRecordedYet',
    defaultMessage: 'No interviews recorded yet.',
    description: 'User-facing message in Interviewer Data View.',
  },
});

type DataViewProps = {
  protocols: ProtocolWithCounts[];
  onReload: () => Promise<void>;
  // Bumped by the parent when sessions change outside this view (e.g.
  // synthetic-data generation/deletion in Settings) so the table re-queries.
  refreshKey?: number;
};

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

const bannerVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: {
    opacity: 1,
    height: 'auto',
    transition: { duration: 0.2 },
  },
  exit: { opacity: 0, height: 0, transition: { duration: 0.15 } },
} as const;

export function DataView({ protocols, onReload, refreshKey }: DataViewProps) {
  const intl = useAppIntl();
  // Total interview steps (including the engine's appended finish stage) by
  // protocol hash, for the progress column's "step X of Y" label. Derived via
  // getInterviewProgress so the host never hard-codes the +1 for the finish
  // stage.
  const { protocolTotalSteps, protocolStages } = useMemo(() => {
    const totalSteps = new Map<string, number>();
    const stagesByHash = new Map<
      string,
      ProtocolWithCounts['protocol']['stages']
    >();
    for (const protocol of protocols) {
      const stages = protocol.protocol.stages ?? [];
      totalSteps.set(protocol.hash, getInterviewProgress(stages, 0).totalSteps);
      stagesByHash.set(protocol.hash, stages);
    }
    return {
      protocolTotalSteps: totalSteps,
      protocolStages: stagesByHash,
    };
  }, [protocols]);

  const protocolOptions = useMemo(() => {
    const names = protocols
      .map((p) => p.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0);
    const seen = new Set<string>(names);
    return Array.from(seen)
      .toSorted((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [protocols]);

  const {
    columnFilters,
    setColumnFilters,
    globalFilter,
    setGlobalFilter,
    sorting,
    setSorting,
  } = useDataViewUrlState();

  const {
    queryParams,
    filtersKey,
    pagination,
    setPagination,
    loaded,
    rows,
    totalCount,
    pageCount,
    statusCounts,
    pageIds,
    reloadData,
  } = useSessionQuery({ columnFilters, globalFilter, sorting, refreshKey });

  const {
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
  } = useSessionSelection({ filtersKey, pageIds, totalCount, queryParams });

  const {
    exportFlow,
    preparingExport,
    deleting,
    markingUnfinishedId,
    handleExport,
    handleCancelBuild,
    handleDismissExport,
    handleDelete,
    handleMarkUnfinished,
    handleShareReady,
  } = useSessionMutations({
    selectedCount,
    resolveSelectedIds,
    clearSelection,
    onReload,
    reloadData,
  });

  const columns = useDataViewColumns({
    protocolTotalSteps,
    isSelected,
    toggleRowSelected,
    togglePageSelected,
    allOnPageSelected,
    someOnPageSelected,
    markingUnfinishedId,
    mutationsBusy: exportFlow.phase !== 'idle' || preparingExport || deleting,
    onMarkUnfinished: (session) => {
      void handleMarkUnfinished(
        session,
        protocolStages.get(session.protocolHash) ?? [],
      );
    },
  });

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

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="laptop:px-11 flex min-h-0 w-full flex-1 flex-col gap-6 px-6 pt-8 pb-8"
    >
      <DataViewToolbar
        table={table}
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        statusCounts={statusCounts}
        protocolOptions={protocolOptions}
        selectedCount={selectedCount}
        exporting={exportFlow.phase !== 'idle' || preparingExport}
        deleting={deleting}
        onExport={() => void handleExport()}
        onDelete={() => void handleDelete()}
      />

      <ExportDialog
        flow={exportFlow}
        onCancelBuild={handleCancelBuild}
        onSave={() => void handleShareReady()}
        onDismiss={handleDismissExport}
      />

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
              {isAllMatchingSelected ? (
                <>
                  <span>
                    {intl.formatMessage(
                      messages.allStrongSelectedCountStrongMatchingInterviewsAre,
                      {
                        strong: (chunks) => <strong>{chunks}</strong>,
                        selectedCount: selectedCount,
                      },
                    )}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={clearSelection}
                    className="font-heading text-sea-green gap-1 font-extrabold tracking-wide uppercase"
                    icon={<X size={14} aria-hidden />}
                  >
                    {intl.formatMessage(messages.clearSelection)}
                  </Button>
                </>
              ) : (
                <>
                  <span>
                    {intl.formatMessage(
                      messages.allStrongLengthStrongOnThisPage,
                      {
                        strong: (chunks) => <strong>{chunks}</strong>,
                        length: rows.length,
                      },
                    )}
                  </span>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={expandSelectionToAll}
                    className="font-heading text-sea-green font-extrabold tracking-wide uppercase"
                  >
                    {intl.formatMessage(messages.selectAllTotalCountMatching, {
                      totalCount: totalCount,
                    })}
                  </Button>
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
            !loaded
              ? intl.formatMessage(messages.loadingInterviews)
              : columnFilters.length > 0 || globalFilter.length > 0
                ? intl.formatMessage(messages.noInterviewsMatchThisFilter)
                : intl.formatMessage(messages.noInterviewsRecordedYet)
          }
        />
      </motion.div>
    </motion.div>
  );
}
