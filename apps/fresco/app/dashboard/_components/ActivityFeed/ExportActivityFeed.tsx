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
    description:
      'Title of the toast shown on the dashboard after the activity feed has been downloaded as a CSV file.',
  },
  activityFeedExportedSuccessfully: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.activityFeedExportedSuccessfully',
    defaultMessage: 'Activity feed exported successfully',
    description:
      'Body of the success toast shown after the activity feed has been downloaded as a CSV file.',
  },
  error: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.error',
    defaultMessage: 'Error',
    description:
      'Title of the error toast shown on the dashboard when exporting the activity feed as a CSV file failed.',
  },
  anErrorOccurredWhileExportingTheActivity: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.anErrorOccurredWhileExportingTheActivity',
    defaultMessage: 'An error occurred while exporting the activity feed',
    description:
      'Body of the error toast shown when downloading the activity feed as a CSV file failed.',
  },
  exportCSV: {
    id: 'fresco.ActivityFeed.ExportActivityFeed.exportCSV',
    defaultMessage: 'Export CSV',
    description:
      'Button on the dashboard activity feed that downloads the whole activity feed as a CSV file. Export is the action; CSV is the file format.',
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
