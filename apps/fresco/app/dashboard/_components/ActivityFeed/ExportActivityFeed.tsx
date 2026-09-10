'use client';

import { FileUp } from 'lucide-react';
import { unparse } from 'papaparse';
import { useTransition } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import { useToast } from '@codaco/fresco-ui/Toast';
import { getActivitiesForExport } from '~/actions/activityFeed';
import { useDownload } from '~/hooks/useDownload';

const messages = defineMessages({
  success: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.success',
    defaultMessage: 'Success',
    description: 'Researcher-facing ActivityFeed / ExportActivityFeed: Success',
  },
  activityFeedExportedSuccessfully: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.activityFeedExportedSuccessfully',
    defaultMessage: 'Activity feed exported successfully',
    description:
      'Researcher-facing ActivityFeed / ExportActivityFeed: Activity feed exported successfully',
  },
  error: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.error',
    defaultMessage: 'Error',
    description: 'Researcher-facing ActivityFeed / ExportActivityFeed: Error',
  },
  anErrorOccurredWhileExportingTheActivity: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.anErrorOccurredWhileExportingTheActivity',
    defaultMessage: 'An error occurred while exporting the activity feed',
    description:
      'Researcher-facing ActivityFeed / ExportActivityFeed: An error occurred while exporting the activity feed',
  },
  exportCSV: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.exportCSV',
    defaultMessage: 'Export CSV',
    description:
      'Researcher-facing ActivityFeed / ExportActivityFeed: Export CSV',
  },
});

export default function ExportActivityFeed() {
  const intl = useAppIntl();

  const download = useDownload();
  const { add } = useToast();
  const [isPending, startTransition] = useTransition();

  const exportActivityFeed = () => {
    startTransition(async () => {
      try {
        const activities = await getActivitiesForExport();

        const csvData = activities.map((activity) => ({
          timestamp: activity.timestamp.toISOString(),
          type: activity.type,
          details: activity.message,
        }));

        const csv = unparse(csvData, { header: true });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        download(url, 'activity-feed.csv');
        URL.revokeObjectURL(url);

        add({
          title: <AppMessage message={messages.success} />,
          description: (
            <AppMessage message={messages.activityFeedExportedSuccessfully} />
          ),
          variant: 'success',
        });
      } catch (error) {
        add({
          title: <AppMessage message={messages.error} />,
          description: (
            <AppMessage
              message={messages.anErrorOccurredWhileExportingTheActivity}
            />
          ),
          variant: 'destructive',
        });
      }
    });
  };

  return (
    <Button
      disabled={isPending}
      onClick={exportActivityFeed}
      icon={<FileUp />}
      data-testid="export-activity-feed-button"
    >
      {intl.formatMessage(messages.exportCSV)}
    </Button>
  );
}
