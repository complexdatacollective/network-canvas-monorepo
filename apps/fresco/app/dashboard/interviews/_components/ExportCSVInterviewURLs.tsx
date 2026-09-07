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
      'Researcher-facing interviews / ExportCSVInterviewURLs: An error occurred while exporting incomplete interview URLs',
  },
  copyExporting: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.copyExporting',
    defaultMessage: 'Exporting...',
    description:
      'Researcher-facing interviews / ExportCSVInterviewURLs: Exporting...',
  },
  copyExport: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.copyExport',
    defaultMessage: 'Export',
    description:
      'Researcher-facing interviews / ExportCSVInterviewURLs: Export',
  },
  success: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.success',
    defaultMessage: 'Success',
    description:
      'Researcher-facing interviews / ExportCSVInterviewURLs: Success',
  },
  incompleteInterviewURLsCSVExportedSuccessfully: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.incompleteInterviewURLsCSVExportedSuccessfully',
    defaultMessage: 'Incomplete interview URLs CSV exported successfully',
    description:
      'Researcher-facing interviews / ExportCSVInterviewURLs: Incomplete interview URLs CSV exported successfully',
  },
  error: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.error',
    defaultMessage: 'Error',
    description: 'Researcher-facing interviews / ExportCSVInterviewURLs: Error',
  },
  anErrorOccurredWhileExportingIncompleteInterview: {
    id: 'fresco.interviews.ExportCSVInterviewURLs.anErrorOccurredWhileExportingIncompleteInterview',
    defaultMessage:
      'An error occurred while exporting incomplete interview URLs',
    description:
      'Researcher-facing interviews / ExportCSVInterviewURLs: An error occurred while exporting incomplete interview URLs',
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
