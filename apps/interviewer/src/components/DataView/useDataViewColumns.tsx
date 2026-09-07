import type { Column, ColumnDef } from '@tanstack/react-table';
import { ArrowDown, Eye, Play, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { updateSettings } from '~/lib/db/api';
import type { StoredSessionLite } from '~/lib/db/types';

const messages = defineMessages({
  selectAllInterviewsOnThisPage: {
    id: 'interviewer.dataViewColumns.selectAllInterviewsOnThisPage',
    defaultMessage: 'Select all interviews on this page',
    description: 'The aria-label label in Interviewer Data View Columns.',
  },
  caseID: {
    id: 'interviewer.dataViewColumns.caseID',
    defaultMessage: 'Case ID',
    description: 'The title label in Interviewer Data View Columns.',
  },
  protocol: {
    id: 'interviewer.dataViewColumns.protocol',
    defaultMessage: 'Protocol',
    description: 'The title label in Interviewer Data View Columns.',
  },
  started: {
    id: 'interviewer.dataViewColumns.started',
    defaultMessage: 'Started',
    description: 'The title label in Interviewer Data View Columns.',
  },
  updated: {
    id: 'interviewer.dataViewColumns.updated',
    defaultMessage: 'Updated',
    description: 'The title label in Interviewer Data View Columns.',
  },
  progress: {
    id: 'interviewer.dataViewColumns.progress',
    defaultMessage: 'Progress',
    description: 'The title label in Interviewer Data View Columns.',
  },
  exportStatus: {
    id: 'interviewer.dataViewColumns.exportStatus',
    defaultMessage: 'Export status',
    description: 'The title label in Interviewer Data View Columns.',
  },
  notExported: {
    id: 'interviewer.dataViewColumns.notExported',
    defaultMessage: 'Not exported',
    description: 'Visible copy in Interviewer Data View Columns.',
  },
  interviewActions: {
    id: 'interviewer.dataViewColumns.interviewActions',
    defaultMessage: 'Interview actions',
    description: 'Visible copy in Interviewer Data View Columns.',
  },
  review: {
    id: 'interviewer.dataViewColumns.review',
    defaultMessage: 'Review',
    description:
      'Row action that opens a finished interview without saving changes.',
  },
  markUnfinished: {
    id: 'interviewer.dataViewColumns.markUnfinished',
    defaultMessage: 'Mark unfinished',
    description: 'Row action that makes a finished interview editable again.',
  },
  resume: {
    id: 'interviewer.dataViewColumns.resume',
    defaultMessage: 'Resume',
    description:
      'Row action that opens an unfinished interview for further data collection.',
  },
  selectCase: {
    id: 'interviewer.dataViewColumns.selectCase',
    defaultMessage: 'Select {caseId}',
    description: 'Administration text in Interviewer useDataViewColumns.',
  },
  stepProgress: {
    id: 'interviewer.dataViewColumns.stepProgress',
    defaultMessage:
      '{hasTotal, select, true {step {step, number} of {total, number}} other {step {step, number} of ?}}',
    description:
      'Accessible progress label on an interview data row. step and total are stage counts; hasTotal is false only when the protocol is unavailable, represented by the invariant question mark.',
  },
  markCaseUnfinished: {
    id: 'interviewer.dataViewColumns.markCaseUnfinished',
    defaultMessage: 'Mark {caseId} unfinished',
    description: 'Administration text in Interviewer useDataViewColumns.',
  },
});

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

// Builds the table's column definitions: the selection checkbox column
// (wired to the selection hook), the sortable data columns, and the
// per-row Resume action.
export function useDataViewColumns({
  protocolTotalSteps,
  isSelected,
  toggleRowSelected,
  togglePageSelected,
  allOnPageSelected,
  someOnPageSelected,
  markingUnfinishedId,
  // Disables row mutations while a bulk mutation (export/delete) is
  // preparing or in flight, so a session update can't race it.
  mutationsBusy,
  onMarkUnfinished,
}: {
  // Total interview steps (including the appended finish stage) by protocol
  // hash, for the progress column's step label.
  protocolTotalSteps: Map<string, number>;
  isSelected: (id: string) => boolean;
  toggleRowSelected: (id: string) => void;
  togglePageSelected: () => void;
  allOnPageSelected: boolean;
  someOnPageSelected: boolean;
  markingUnfinishedId: string | null;
  mutationsBusy: boolean;
  onMarkUnfinished: (session: StoredSessionLite) => void;
}) {
  const intl = useAppIntl();
  const [, navigate] = useLocation();

  return useMemo<ColumnDef<StoredSessionLite>[]>(
    () => [
      {
        id: 'select',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        header: () => (
          <Checkbox
            size="sm"
            aria-label={intl.formatMessage(
              messages.selectAllInterviewsOnThisPage,
            )}
            checked={allOnPageSelected}
            indeterminate={someOnPageSelected}
            onCheckedChange={togglePageSelected}
          />
        ),
        cell: ({ row }) => {
          const id = row.original.id;
          return (
            <Checkbox
              size="sm"
              aria-label={intl.formatMessage(messages.selectCase, {
                caseId: row.original.caseId,
              })}
              checked={isSelected(id)}
              onCheckedChange={() => {
                toggleRowSelected(id);
              }}
            />
          );
        },
      },
      {
        id: 'caseId',
        accessorKey: 'caseId',
        header: ({ column }) => (
          <SortHeader
            column={column}
            title={intl.formatMessage(messages.caseID)}
          />
        ),
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
        header: ({ column }) => (
          <SortHeader
            column={column}
            title={intl.formatMessage(messages.protocol)}
          />
        ),
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
        header: ({ column }) => (
          <SortHeader
            column={column}
            title={intl.formatMessage(messages.started)}
          />
        ),
        enableSorting: true,
        cell: ({ getValue }) => <TimeAgo date={getValue<string>()} />,
      },
      {
        id: 'updatedAt',
        accessorKey: 'lastUpdatedAt',
        header: ({ column }) => (
          <SortHeader
            column={column}
            title={intl.formatMessage(messages.updated)}
          />
        ),
        enableSorting: true,
        cell: ({ getValue }) => <TimeAgo date={getValue<string>()} />,
      },
      {
        id: 'progress',
        header: ({ column }) => (
          <SortHeader
            column={column}
            title={intl.formatMessage(messages.progress)}
          />
        ),
        enableSorting: true,
        cell: ({ row }) => {
          const session = row.original;
          const totalSteps = protocolTotalSteps.get(session.protocolHash) ?? 0;
          const percent = session.progressPercent;
          return (
            <div className="flex items-center gap-2">
              <div className="w-24">
                <ProgressBar
                  nudge={false}
                  orientation="horizontal"
                  percentProgress={percent}
                  label={intl.formatMessage(messages.stepProgress, {
                    step: session.currentStep + 1,
                    total: totalSteps,
                    hasTotal: String(totalSteps > 0),
                  })}
                />
              </div>
              <span className="font-monospace text-text/60 text-xs tabular-nums">
                {intl.formatNumber(percent / 100, { style: 'percent' })}
              </span>
            </div>
          );
        },
      },
      {
        id: 'exportedAt',
        accessorKey: 'exportedAt',
        header: ({ column }) => (
          <SortHeader
            column={column}
            title={intl.formatMessage(messages.exportStatus)}
          />
        ),
        enableSorting: true,
        cell: ({ getValue }) => {
          const value = getValue<string | null>();
          return value ? (
            <TimeAgo date={value} />
          ) : (
            <span className="text-text/60 text-xs">
              {intl.formatMessage(messages.notExported)}
            </span>
          );
        },
      },
      {
        id: 'resume',
        enableSorting: false,
        enableColumnFilter: false,
        enableGlobalFilter: false,
        header: () => (
          <span className="sr-only">
            {intl.formatMessage(messages.interviewActions)}
          </span>
        ),
        cell: ({ row }) => {
          const session = row.original;
          if (session.statusKind === 'complete') {
            return (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="text"
                  color="primary"
                  icon={<Eye aria-hidden />}
                  onClick={() =>
                    navigate(`/interview/${session.id}?mode=review`)
                  }
                  data-testid="data-review"
                >
                  {intl.formatMessage(messages.review)}
                </Button>
                <Button
                  size="sm"
                  variant="text"
                  color="dynamic"
                  icon={<RotateCcw aria-hidden />}
                  aria-label={intl.formatMessage(messages.markCaseUnfinished, {
                    caseId: session.caseId,
                  })}
                  disabled={markingUnfinishedId !== null || mutationsBusy}
                  onClick={() => onMarkUnfinished(session)}
                  className="min-w-max"
                  data-testid="data-mark-unfinished"
                >
                  {intl.formatMessage(messages.markUnfinished)}
                </Button>
              </div>
            );
          }
          const id = row.original.id;
          return (
            <Button
              size="sm"
              variant="text"
              color="primary"
              icon={<Play aria-hidden />}
              onClick={() => {
                void updateSettings({ lastActiveSessionId: id }).then(() =>
                  navigate(`/interview/${id}`),
                );
              }}
              data-testid="data-resume"
            >
              {intl.formatMessage(messages.resume)}
            </Button>
          );
        },
      },
    ],
    [
      intl,
      allOnPageSelected,
      someOnPageSelected,
      isSelected,
      toggleRowSelected,
      togglePageSelected,
      protocolTotalSteps,
      markingUnfinishedId,
      mutationsBusy,
      navigate,
      onMarkUnfinished,
    ],
  );
}
