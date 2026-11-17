'use client';
import { defineMessages } from '@codaco/app-i18n/messages';
import type { IntlShape } from '@codaco/app-i18n/messages';
import { Badge } from '@codaco/fresco-ui/Badge';
import { DataTableColumnHeader } from '@codaco/fresco-ui/DataTable/ColumnHeader';
import { type StrictColumnDef } from '@codaco/fresco-ui/DataTable/types';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { formatActivityDetails } from '~/i18n/activityDetails';
import type { Events } from '~/lib/db/generated/client';

import { formatActivityType } from './messages';
import { getBadgeColorForActivityType } from './utils';

const messages = defineMessages({
  time: {
    id: 'fresco.ActivityFeed.ColumnDefinition.time',
    defaultMessage: 'Time',
    description:
      'Column heading in the activity feed table on the dashboard; the column shows how long ago each event happened.',
  },
  type: {
    id: 'fresco.ActivityFeed.ColumnDefinition.type',
    defaultMessage: 'Type',
    description:
      'Column heading in the activity feed table on the dashboard; the column shows a badge naming the kind of event (not a verb).',
  },
  details: {
    id: 'fresco.ActivityFeed.ColumnDefinition.details',
    defaultMessage: 'Details',
    description:
      'Column heading in the activity feed table on the dashboard; the column holds a sentence describing what happened in each event.',
  },
});

export function fetchActivityFeedTableColumnDefs(
  intl: IntlShape,
): StrictColumnDef<Events>[] {
  return [
    {
      accessorKey: 'timestamp',
      sortFn: 'datetime',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={intl.formatMessage(messages.time)}
        />
      ),
      cell: ({ row }) => {
        const timestamp: string = row.getValue('timestamp');
        return <TimeAgo date={timestamp} />;
      },
    },
    {
      accessorKey: 'type',
      sortFn: 'text',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={intl.formatMessage(messages.type)}
        />
      ),
      cell: ({ row }) => {
        const activityType: string = row.getValue('type');
        const color = getBadgeColorForActivityType(activityType);
        return (
          <Badge color={color}>{formatActivityType(intl, activityType)}</Badge>
        );
      },
      enableHiding: false,
    },
    {
      accessorKey: 'message',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={intl.formatMessage(messages.details)}
        />
      ),
      cell: ({ row }) => (
        <div className="whitespace-normal">
          {formatActivityDetails(intl, row.original)}
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
