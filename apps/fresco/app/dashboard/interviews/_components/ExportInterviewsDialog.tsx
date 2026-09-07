'use client';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import useSafeLocalStorage from '@codaco/fresco-ui/hooks/useSafeLocalStorage';
import { ExportOptionsSchema } from '@codaco/network-exporters/options';
import { useExportProgress } from '~/components/ExportProgressProvider';

import ExportOptionsView from './ExportOptionsView';

const messages = defineMessages({
  confirmFileExportOptions: {
    id: 'fresco.interviews.ExportInterviewsDialog.confirmFileExportOptions',
    defaultMessage: 'Confirm File Export Options',
    description:
      'Researcher-facing interviews / ExportInterviewsDialog: Confirm File Export Options',
  },
  beforeExportingPleaseConfirmTheExportOptions: {
    id: 'fresco.interviews.ExportInterviewsDialog.beforeExportingPleaseConfirmTheExportOptions',
    defaultMessage:
      'Before exporting, please confirm the export options that you wish to use. These options are identical to those found in Interviewer.',
    description:
      'Researcher-facing interviews / ExportInterviewsDialog: Before exporting, please confirm the export options that you wish to use. These options are identical to those found in ',
  },
  startExportProcess: {
    id: 'fresco.interviews.ExportInterviewsDialog.startExportProcess',
    defaultMessage: 'Start export process',
    description:
      'Researcher-facing interviews / ExportInterviewsDialog: Start export process',
  },
});

export const ExportInterviewsDialog = ({
  open,
  handleCancel,
  interviewIds,
}: {
  open: boolean;
  handleCancel: () => void;
  interviewIds: string[];
}) => {
  const intl = useAppIntl();

  const { startExport } = useExportProgress();

  const [exportOptions, setExportOptions] = useSafeLocalStorage(
    'exportOptions',
    ExportOptionsSchema,
    {
      exportCSV: true,
      exportGraphML: true,
      globalOptions: {
        useScreenLayoutCoordinates: true,
        screenLayoutHeight: 1080,
        screenLayoutWidth: 1920,
      },
    },
  );

  const handleConfirm = () => {
    startExport(interviewIds, exportOptions);
    handleCancel();
  };

  return (
    <Dialog
      open={open}
      closeDialog={handleCancel}
      title={intl.formatMessage(messages.confirmFileExportOptions)}
      description={intl.formatMessage(
        messages.beforeExportingPleaseConfirmTheExportOptions,
      )}
      footer={
        <>
          <Button onClick={handleCancel}>
            {intl.formatMessage(commonMessages.cancel)}
          </Button>
          <Button onClick={handleConfirm} color="primary">
            {intl.formatMessage(messages.startExportProcess)}
          </Button>
        </>
      }
    >
      <ExportOptionsView
        exportOptions={exportOptions}
        setExportOptions={setExportOptions}
      />
    </Dialog>
  );
};
