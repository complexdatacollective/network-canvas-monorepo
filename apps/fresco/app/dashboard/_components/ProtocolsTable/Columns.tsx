'use client';

import Image from 'next/image';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { Badge } from '@codaco/fresco-ui/Badge';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { type StrictColumnDef } from '@codaco/fresco-ui/DataTable/types';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { isLegacySchemaVersion } from '~/lib/schema-8/version';

import { AnonymousRecruitmentURLButton } from './AnonymousRecruitmentURLButton';
import type { ProtocolWithInterviews } from './ProtocolsTableClient';

const messages = defineMessages({
  selectAll: {
    id: 'fresco.ProtocolsTable.Columns.selectAll',
    defaultMessage: 'Select all',
    description:
      'Accessible name of the checkbox in the header of the Protocols table that selects every protocol on the page. Read only by screen readers.',
  },
  selectRow: {
    id: 'fresco.ProtocolsTable.Columns.selectRow',
    defaultMessage: 'Select row',
    description:
      'Accessible name of the checkbox at the start of each row of the Protocols table that selects that one protocol. Read only by screen readers.',
  },
  name: {
    id: 'fresco.ProtocolsTable.Columns.name',
    defaultMessage: 'Name',
    description:
      'Column heading in the Protocols table above the protocol names. Clicking it sorts the table by name.',
  },
  protocolIcon: {
    id: 'fresco.ProtocolsTable.Columns.protocolIcon',
    defaultMessage: 'Protocol icon',
    description:
      'Alternative text of the small decorative protocol picture shown beside each protocol name in the Protocols table. Read only by screen readers.',
  },
  imported: {
    id: 'fresco.ProtocolsTable.Columns.imported',
    defaultMessage: 'Imported',
    description:
      'Column heading in the Protocols table above how long ago each protocol was uploaded to this installation. Clicking it sorts by that date.',
  },
  modified: {
    id: 'fresco.ProtocolsTable.Columns.modified',
    defaultMessage: 'Modified',
    description:
      'Column heading in the Protocols table above how long ago each protocol was last modified, as recorded in the protocol. Clicking it sorts by that date.',
  },
  schemaBadge: {
    id: 'fresco.ProtocolsTable.Columns.schemaBadge',
    defaultMessage: 'Schema {version}',
    description:
      'Short badge beside a protocol in the protocols table, marking a protocol kept at an older schema version when it was imported. Its interviews run in the older version of the interview. {version} is that schema version number (for example 8).',
  },
  anonymousParticipationURL: {
    id: 'fresco.ProtocolsTable.Columns.anonymousParticipationURL',
    defaultMessage: 'Anonymous Participation URL',
    description:
      'Column heading in the Protocols table, shown only when anonymous recruitment is on, above a button that copies the link a participant can open to start an interview without a personal identifier.',
  },
});

export const getProtocolColumns = (
  intl: IntlShape,
  allowAnonRecruitment = false,
): StrictColumnDef<ProtocolWithInterviews>[] => {
  const columns: StrictColumnDef<ProtocolWithInterviews>[] = [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(value)}
          aria-label={intl.formatMessage(messages.selectAll)}
        />
      ),
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
      accessorKey: 'name',
      sortFn: 'text',
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.name)}
          />
        );
      },
      cell: ({ row }) => {
        return (
          <div className="flex items-center gap-2">
            <Image
              src="/images/protocol-icon.png"
              alt={intl.formatMessage(messages.protocolIcon)}
              width={32}
              height={24}
              className="shrink-0"
            />
            <span dir="auto" className="text-match-parent">
              {row.original.name}
            </span>
            {isLegacySchemaVersion(row.original.schemaVersion) && (
              <Badge tone="neutral" appearance="outline" size="sm">
                {intl.formatMessage(messages.schemaBadge, {
                  version: row.original.schemaVersion,
                })}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'importedAt',
      sortFn: 'datetime',
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.imported)}
          />
        );
      },
      cell: ({ row }) => <TimeAgo date={row.original.importedAt} />,
    },
    {
      accessorKey: 'lastModified',
      sortFn: 'datetime',
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.modified)}
          />
        );
      },
      cell: ({ row }) => <TimeAgo date={row.original.lastModified} />,
    },
  ];

  if (allowAnonRecruitment) {
    columns.push({
      id: 'participant-url',
      enableSorting: false,
      header: ({ column }) => {
        return (
          <DataTableColumnHeader
            column={column}
            title={intl.formatMessage(messages.anonymousParticipationURL)}
          />
        );
      },
      cell: ({ row }) => {
        return <AnonymousRecruitmentURLButton protocolId={row.original.id} />;
      },
    });
  }

  return columns;
};
