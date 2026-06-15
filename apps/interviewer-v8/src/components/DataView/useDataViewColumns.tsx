import type { Column, ColumnDef } from '@tanstack/react-table';
import { ArrowDown, Play } from 'lucide-react';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { updateSettings } from '~/lib/db/api';
import type { StoredSessionLite } from '~/lib/db/types';

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
  protocolStageCounts,
  isSelected,
  toggleRowSelected,
  togglePageSelected,
  allOnPageSelected,
  someOnPageSelected,
}: {
  // Stage totals by protocol hash, for the progress column's step label.
  protocolStageCounts: Map<string, number>;
  isSelected: (id: string) => boolean;
  toggleRowSelected: (id: string) => void;
  togglePageSelected: () => void;
  allOnPageSelected: boolean;
  someOnPageSelected: boolean;
}) {
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
            aria-label="Select all interviews on this page"
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
              aria-label={`Select ${row.original.caseId}`}
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
              icon={<Play aria-hidden />}
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
      isSelected,
      toggleRowSelected,
      togglePageSelected,
      protocolStageCounts,
      navigate,
    ],
  );
}
