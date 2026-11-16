'use client';

import { Download } from 'lucide-react';
import { unparse } from 'papaparse';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import { useToast } from '@codaco/fresco-ui/Toast';
import type { IncompleteInterviewUrlData } from '~/actions/interviews';
import { useDownload } from '~/hooks/useDownload';

import type { ProtocolWithInterviews } from '../../_components/ProtocolsTable/ProtocolsTableClient';

const messages = defineMessages({
  copyAnErrorOccurredWhileExportingIncompleteInterview: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.copyAnErrorOccurredWhileExportingIncompleteInterview',
    defaultMessage:
      'An error occurred while exporting incomplete interview URLs',
    description:
      'Message of an error thrown, not shown directly, when downloading the CSV of links to incomplete interviews failed. Same wording as the error toast body.',
  },
  copyExporting: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.copyExporting',
    defaultMessage: 'Exporting...',
    description:
      'Label of the export button in the incomplete interview links popover while the CSV file is being created. A progress state, not a command.',
  },
  copyExport: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.copyExport',
    defaultMessage: 'Export',
    description:
      "Button in the incomplete interview links popover on the Interviews page that downloads a CSV file of links to the selected protocol's unfinished interviews. Export is a verb.",
  },
  success: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.success',
    defaultMessage: 'Success',
    description:
      'Title of the toast shown after the CSV file of links to incomplete interviews has been downloaded.',
  },
  incompleteInterviewURLsCSVExportedSuccessfully: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.incompleteInterviewURLsCSVExportedSuccessfully',
    defaultMessage: 'Incomplete interview URLs CSV exported successfully',
    description:
      'Body of the success toast shown after the CSV file of links (URLs) to unfinished interviews has been downloaded.',
  },
  error: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.error',
    defaultMessage: 'Error',
    description:
      'Title of the error toast shown when downloading the CSV file of links to incomplete interviews failed.',
  },
  anErrorOccurredWhileExportingIncompleteInterview: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.anErrorOccurredWhileExportingIncompleteInterview',
    defaultMessage:
      'An error occurred while exporting incomplete interview URLs',
    description:
      'Body of the error toast shown when downloading the CSV file of links (URLs) to incomplete interviews failed.',
  },
});

function ExportCSVInterviewURLs({
  protocol,
  interviews,
  disabled = false,
}: {
  protocol?: ProtocolWithInterviews;
  interviews: IncompleteInterviewUrlData[];
  disabled?: boolean;
}) {
  const intl = useAppIntl();

  const download = useDownload();
  const [isExporting, setIsExporting] = useState(false);
  const { add } = useToast();

  const handleExport = () => {
    try {
      setIsExporting(true);
      if (!protocol?.id) return;

      const csvData = interviews.map((interview) => ({
        identifier: interview.identifier,
        interview_url: `${window.location.origin}/interview/${interview.id}`,
      }));

      const csv = unparse(csvData, { header: true });

      // Create a download link
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      // trigger the download
      const protocolNameWithoutExtension = protocol.name.split('.')[0];
      const fileName = `incomplete_interview_urls_${protocolNameWithoutExtension}.csv`;
      download(url, fileName);
      // Clean up the URL object
      URL.revokeObjectURL(url);
      add({
        title: <AppMessage message={messages.success} />,
        description: (
          <AppMessage
            message={messages.incompleteInterviewURLsCSVExportedSuccessfully}
          />
        ),
        variant: 'success',
      });
    } catch (error) {
      add({
        title: <AppMessage message={messages.error} />,
        description: (
          <AppMessage
            message={messages.anErrorOccurredWhileExportingIncompleteInterview}
          />
        ),
        variant: 'destructive',
      });
      throw new Error(
        intl.formatMessage(
          messages.copyAnErrorOccurredWhileExportingIncompleteInterview,
        ),
        { cause: error },
      );
    }

    setIsExporting(false);
  };

  return (
    <Button
      size="sm"
      disabled={!protocol || isExporting || disabled}
      onClick={handleExport}
      icon={<Download />}
      color="primary"
    >
      {isExporting
        ? intl.formatMessage(messages.copyExporting)
        : intl.formatMessage(messages.copyExport)}
    </Button>
  );
}

export default ExportCSVInterviewURLs;
