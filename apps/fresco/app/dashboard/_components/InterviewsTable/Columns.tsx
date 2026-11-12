'use client';

import Image from 'next/image';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { Badge } from '@codaco/fresco-ui/Badge';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import {
  booleanFilterFn,
  dateFilterFn,
  facetedFilterFn,
  operatorFilterFn,
  rangeFilterFn,
} from '@codaco/fresco-ui/DataTable/filters/filterFns';
import { SelectAllHeader } from '@codaco/fresco-ui/DataTable/SelectAllHeader';
import { type StrictColumnDef } from '@codaco/fresco-ui/DataTable/types';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import ProgressBar from '@codaco/fresco-ui/ProgressBar';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import type {
  GetInterviewsQuery,
  InterviewFilterOptions,
} from '~/queries/interviews';

import { computeInterviewProgress } from './computeInterviewProgress';
import NetworkSummary from './NetworkSummary';

const messages = defineMessages({
  selectRow: {
    id: 'fresco.InterviewsTable.Columns.selectRow',
    defaultMessage: 'Select row',
    description:
      'Accessible name of the checkbox at the start of each row of the interviews table; read only by screen readers. Selects that one interview.',
  },
  participantIcon: {
    id: 'fresco.InterviewsTable.Columns.participantIcon',
    defaultMessage: 'Participant icon',
    description:
      'Alternative text of the small participant icon shown beside the Participant Identifier column heading of the interviews table; read only by screen readers.',
  },
  participantIdentifier: {
    id: 'fresco.InterviewsTable.Columns.participantIdentifier',
    defaultMessage: 'Participant Identifier',
    description:
      "Column heading of the interviews table for the study participant's identifier, the label that identifies the participant who took the interview.",
  },
  protocolIcon: {
    id: 'fresco.InterviewsTable.Columns.protocolIcon',
    defaultMessage: 'Protocol icon',
    description:
      'Alternative text of the small protocol icon shown beside the Protocol Name column heading of the interviews table; read only by screen readers.',
  },
  protocolName: {
    id: 'fresco.InterviewsTable.Columns.protocolName',
    defaultMessage: 'Protocol Name',
    description:
      'Column heading of the interviews table for the name of the interview protocol each interview was conducted with. Also the label of its filter.',
  },
  started: {
    id: 'fresco.InterviewsTable.Columns.started',
    defaultMessage: 'Started',
    description:
      'Column heading of the interviews table for the time the interview was started. Past participle used as a label, not an action.',
  },
  updated: {
    id: 'fresco.InterviewsTable.Columns.updated',
    defaultMessage: 'Updated',
    description:
      'Column heading of the interviews table for the time the interview was last changed. Past participle used as a label, not an action.',
  },
  notStarted: {
    id: 'fresco.InterviewsTable.Columns.notStarted',
    defaultMessage: 'Not Started',
    description:
      'Preset option in the Progress filter of the interviews table that selects interviews with 0% progress (no stage reached yet).',
  },
  inProgress: {
    id: 'fresco.InterviewsTable.Columns.inProgress',
    defaultMessage: 'In Progress',
    description:
      'Preset option in the Progress filter of the interviews table that selects interviews between 1% and 99% progress (begun but not finished).',
  },
  complete: {
    id: 'fresco.InterviewsTable.Columns.complete',
    defaultMessage: 'Complete',
    description:
      'Preset option in the Progress filter of the interviews table that selects interviews at 100% progress (finished). An adjective for the interview, not an action.',
  },
  progress: {
    id: 'fresco.InterviewsTable.Columns.progress',
    defaultMessage: 'Progress',
    description:
      'Column heading of the interviews table for how far through its stages each interview has got, shown as a bar and a percentage. Also the label of its filter.',
  },
  entityType: {
    id: 'fresco.InterviewsTable.Columns.entityType',
    defaultMessage: 'Entity Type',
    description:
      'Label of the first dropdown in the Network filter of the interviews table, where the researcher picks which type of node or edge to count. Entity means a node or an edge.',
  },
  nodes: {
    id: 'fresco.InterviewsTable.Columns.nodes',
    defaultMessage: '{value1} (nodes)',
    description:
      'Option in the entity type dropdown of the Network filter of the interviews table. value is a node type name defined by the protocol author; keep it as is.',
  },
  edges: {
    id: 'fresco.InterviewsTable.Columns.edges',
    defaultMessage: '{value1} (edges)',
    description:
      'Option in the entity type dropdown of the Network filter of the interviews table. value is an edge type name defined by the protocol author; keep it as is.',
  },
  network: {
    id: 'fresco.InterviewsTable.Columns.network',
    defaultMessage: 'Network',
    description:
      'Column heading of the interviews table for the summary of the network (people or things and their connections) recorded in each interview.',
  },
  exported: {
    id: 'fresco.InterviewsTable.Columns.exported',
    defaultMessage: 'Exported',
    description:
      'Option in the Export Status filter of the interviews table that selects interviews whose data has already been exported. Status, not an action.',
  },
  notExported: {
    id: 'fresco.InterviewsTable.Columns.notExported',
    defaultMessage: 'Not Exported',
    description:
      'Option in the Export Status filter of the interviews table that selects interviews whose data has never been exported. Status, not an action.',
  },
  exportStatus: {
    id: 'fresco.InterviewsTable.Columns.exportStatus',
    defaultMessage: 'Export Status',
    description:
      "Column heading of the interviews table for whether and when each interview's data was last exported. Also the label of its filter.",
  },
  notExported2: {
    id: 'fresco.InterviewsTable.Columns.notExported2',
    defaultMessage: 'Not exported',
    description:
      "Red badge in a cell of the Export Status column of the interviews table when the interview's data has never been exported.",
  },
});

type InterviewRow = GetInterviewsQuery[number];

export const getInterviewColumns = (
  intl: IntlShape,
  filterOptions: InterviewFilterOptions,
): StrictColumnDef<InterviewRow>[] => {
  return [
    {
      id: 'select',
      meta: {
        className: 'sticky inset-s-0',
      },
      header: ({ table }) => <SelectAllHeader table={table} />,
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(value)}
          aria-label={intl.formatMessage(messages.selectRow)}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: 'identifier',
      accessorKey: 'participant.identifier',
      sortFn: 'text',
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={
              <div className="flex items-center gap-2">
                <Image
                  src="/images/participant.svg"
                  alt={intl.formatMessage(messages.participantIcon)}
                  className="size-[24px]"
                  width={24}
                  height={24}
                />
                {intl.formatMessage(messages.participantIdentifier)}
              </div>
            }
          />
        );
      },
      cell: ({ row }) => {
        return (
          <div
            className="flex items-center gap-2"
            title={row.original.participant.identifier}
          >
            <Badge
              dir="auto"
              appearance="outline"
              className="text-match-parent max-w-80 truncate"
            >
              {row.original.participant.identifier}
            </Badge>
          </div>
        );
      },
    },
    {
      id: 'protocolName',
      accessorKey: 'protocol.name',
      sortFn: 'text',
      meta: {
        filterType: 'faceted',
        filterConfig: {
          type: 'faceted',
          options: () =>
            filterOptions.protocolNames.map((name) => ({
              value: name,
              label: name.replace(/\.netcanvas$/, ''),
            })),
        },
      },
      filterFn: facetedFilterFn,
      header: ({ column, table }) => {
        return (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={
              <div className="flex items-center gap-2">
                <Image
                  src="/images/protocol-icon.png"
                  alt={intl.formatMessage(messages.protocolIcon)}
                  className="size-[24px]"
                  width={24}
                  height={24}
                />
                {intl.formatMessage(messages.protocolName)}
              </div>
            }
          />
        );
      },
      cell: ({ row }) => {
        const protocolFileName = row.original.protocol.name;
        const protocolName = protocolFileName.replace(/\.netcanvas$/, '');
        return (
          <div
            className="flex w-full max-w-72 items-center gap-2"
            title={row.original.protocol.name}
          >
            <span dir="auto" className="text-match-parent truncate">
              {protocolName}
            </span>
          </div>
        );
      },
    },
    {
      id: 'startTime',
      accessorKey: 'startTime',
      sortFn: 'datetime',
      meta: {
        filterType: 'date',
        filterConfig: { type: 'date' },
      },
      filterFn: dateFilterFn,
      header: ({ column, table }) => {
        return (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.started)}
          />
        );
      },
      cell: ({ row }) => {
        return <TimeAgo date={row.original.startTime} />;
      },
    },
    {
      id: 'lastUpdated',
      accessorKey: 'lastUpdated',
      sortFn: 'datetime',
      meta: {
        filterType: 'date',
        filterConfig: { type: 'date' },
      },
      filterFn: dateFilterFn,
      header: ({ column, table }) => {
        return (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.updated)}
          />
        );
      },
      cell: ({ row }) => {
        return <TimeAgo date={row.original.lastUpdated} />;
      },
    },
    {
      id: 'progress',
      sortFn: 'basic',
      accessorFn: (row) =>
        computeInterviewProgress({
          finishTime: row.finishTime,
          currentStep: row.currentStep,
          stageCount: row.protocol.stageCount,
        }),
      meta: {
        filterType: 'range',
        filterConfig: {
          type: 'range',
          min: 0,
          max: 100,
          step: 1,
          presets: [
            { label: intl.formatMessage(messages.notStarted), min: 0, max: 0 },
            { label: intl.formatMessage(messages.inProgress), min: 1, max: 99 },
            {
              label: intl.formatMessage(messages.complete),
              min: 100,
              max: 100,
            },
          ],
          formatLabel: (v: number) =>
            intl.formatNumber(v / 100, { style: 'percent' }),
        },
      },
      filterFn: rangeFilterFn,
      header: ({ column, table }) => {
        return (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.progress)}
          />
        );
      },
      cell: ({ row }) => {
        const progress = computeInterviewProgress({
          finishTime: row.original.finishTime,
          currentStep: row.original.currentStep,
          stageCount: row.original.protocol.stageCount,
        });
        return (
          <div className="flex items-center whitespace-nowrap">
            <ProgressBar
              orientation="horizontal"
              percentProgress={progress}
              nudge={false}
            />
            <div className="ms-2 text-center">
              {intl.formatNumber(progress / 100, {
                style: 'percent',
                maximumFractionDigits: 0,
              })}
            </div>
          </div>
        );
      },
    },
    {
      id: 'network',
      enableSorting: false,
      accessorFn: (row) => {
        const network = row.network;
        const nodeCount = network.nodes.reduce((sum, n) => sum + n.count, 0);
        const edgeCount = network.edges.reduce((sum, e) => sum + e.count, 0);
        return nodeCount + edgeCount;
      },
      meta: {
        filterType: 'operator',
        filterConfig: {
          type: 'operator',
          operators: ['eq', 'gt', 'lt', 'gte', 'lte'],
          entitySelector: {
            label: intl.formatMessage(messages.entityType),
            getOptions: () => [
              ...filterOptions.nodeTypes.map((t) => ({
                value: `nodes.${t.value}`,
                label: intl.formatMessage(messages.nodes, { value1: t.label }),
              })),
              ...filterOptions.edgeTypes.map((t) => ({
                value: `edges.${t.value}`,
                label: intl.formatMessage(messages.edges, { value1: t.label }),
              })),
            ],
          },
        },
      },
      filterFn: operatorFilterFn,
      header: ({ column, table }) => {
        return (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.network)}
          />
        );
      },
      cell: ({ row }) => {
        return <NetworkSummary network={row.original.network} />;
      },
    },
    {
      id: 'exportTime',
      accessorKey: 'exportTime',
      sortFn: 'datetime',
      meta: {
        filterType: 'boolean',
        filterConfig: {
          type: 'boolean',
          trueLabel: intl.formatMessage(messages.exported),
          falseLabel: intl.formatMessage(messages.notExported),
        },
      },
      filterFn: booleanFilterFn,
      header: ({ column, table }) => {
        return (
          <DataTableColumnHeader
            column={column}
            table={table}
            title={intl.formatMessage(messages.exportStatus)}
          />
        );
      },
      cell: ({ row }) => {
        if (!row.original.exportTime) {
          return (
            <Badge tone="destructive">
              {intl.formatMessage(messages.notExported2)}
            </Badge>
          );
        }

        return <TimeAgo date={row.original.exportTime} />;
      },
    },
  ];
};
