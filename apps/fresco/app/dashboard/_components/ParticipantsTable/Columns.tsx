'use client';

import Image from 'next/image';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { Badge } from '@codaco/fresco-ui/Badge';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { SelectAllHeader } from '@codaco/fresco-ui/DataTable/SelectAllHeader';
import { type StrictColumnDef } from '@codaco/fresco-ui/DataTable/types';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';

import type { ProtocolWithInterviews } from '../ProtocolsTable/ProtocolsTableClient';
import { GenerateParticipationURLButton } from './GenerateParticipantURLButton';
import type { ParticipantRow } from './ParticipantsTableClient';

const messages = defineMessages({
  interviewCounts: {
    id: 'fresco.participants.table.interviewCounts',
    defaultMessage:
      '{total, number} ({completed, plural, one {# completed} other {# completed}})',
    description:
      'Total interviews and completed interviews for one participant.',
  },

  selectRow: {
    id: 'fresco.ParticipantsTable.Columns.selectRow',
    defaultMessage: 'Select row',
    description:
      'Accessible name of the checkbox at the start of each participants table row that selects the row; read only by screen readers.',
  },
  identifier: {
    id: 'fresco.ParticipantsTable.Columns.identifier',
    defaultMessage: 'Identifier',
    description:
      'Column heading in the participants table for the participant identifier, the unique code that identifies a study participant.',
  },
  protocolIcon: {
    id: 'fresco.ParticipantsTable.Columns.protocolIcon',
    defaultMessage: 'Protocol icon',
    description:
      'Alternative text of the small participant picture shown beside each identifier in the participants table; read only by screen readers.',
  },
  label: {
    id: 'fresco.ParticipantsTable.Columns.label',
    defaultMessage: 'Label',
    description:
      'Column heading in the participants table for the optional human-readable label (for example a name) a researcher gave a participant. A noun.',
  },
  interviews: {
    id: 'fresco.ParticipantsTable.Columns.interviews',
    defaultMessage: 'Interviews',
    description:
      'Column heading in the participants table for the number of interviews each participant has, with how many are completed.',
  },

  uniqueParticipantURL: {
    id: 'fresco.ParticipantsTable.Columns.uniqueParticipantURL',
    defaultMessage: 'Unique Participant URL',
    description:
      "Column heading in the participants table above the buttons that generate or copy each participant's personal interview link (URL).",
  },
});

export function getParticipantColumns(
  intl: IntlShape,
  protocols: ProtocolWithInterviews[],
): StrictColumnDef<ParticipantRow>[] {
  return [
    {
      id: 'select',
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
      accessorKey: 'identifier',
      sortFn: 'text',
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.identifier)}
          />
        );
      },
      cell: ({ row }) => {
        return (
          <div
            className="flex items-center gap-2"
            title={row.original.identifier}
          >
            <Image
              src="/images/participant.svg"
              alt={intl.formatMessage(messages.protocolIcon)}
              className="max-w-none"
              width={24}
              height={24}
            />
            <Badge appearance="outline">
              <span dir="auto" className="text-match-parent max-w-56 truncate">
                {row.original.identifier}
              </span>
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: 'label',
      sortFn: 'text',
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.label)}
          />
        );
      },
      cell: ({ row }) => {
        return (
          <span dir="auto" className="text-match-parent truncate">
            {row.original.label}
          </span>
        );
      },
    },
    {
      id: 'interviews',
      accessorFn: (row) => row._count.interviews,
      sortFn: 'basic',
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.interviews)}
          />
        );
      },
      cell: ({ row }) => {
        const completedInterviews = row.original.interviews.filter(
          (interview) => interview.finishTime,
        ).length;
        return (
          <span>
            {intl.formatMessage(messages.interviewCounts, {
              total: row.original._count.interviews,
              completed: completedInterviews,
            })}
          </span>
        );
      },
    },
    {
      id: 'participant-url',
      enableSorting: false,
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.uniqueParticipantURL)}
          />
        );
      },
      cell: ({ row }) => {
        return (
          <GenerateParticipationURLButton
            participant={row.original}
            protocols={protocols}
          />
        );
      },
    },
  ];
}
