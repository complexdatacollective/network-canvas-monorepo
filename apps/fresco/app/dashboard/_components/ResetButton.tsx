'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { resetAppSettings } from '~/actions/reset';

const messages = defineMessages({
  copyResetting: {
    id: 'fresco.ResetButton.copyResetting',
    defaultMessage: 'Resetting...',
    description:
      'Label of the confirm button in the reset dialog, shown while all application data is being deleted.',
  },
  copyDeleteAllData: {
    id: 'fresco.ResetButton.copyDeleteAllData',
    defaultMessage: 'Delete all data',
    description:
      'Label of the destructive confirm button in the reset dialog in Settings. Pressing it permanently deletes all interviews, protocols and other data on the installation.',
  },
  resetAllAppData: {
    id: 'fresco.ResetButton.resetAllAppData',
    defaultMessage: 'Reset all app data',
    description:
      'Label of the destructive button in Settings that opens a confirmation dialog before deleting all data on the installation.',
  },
  areYouSure: {
    id: 'fresco.ResetButton.areYouSure',
    defaultMessage: 'Are you sure?',
    description:
      'Title of the dialog that asks the researcher to confirm deleting all data on the installation.',
  },
  thisActionWillDeleteALLApplicationData: {
    id: 'fresco.ResetButton.thisActionWillDeleteALLApplicationData',
    defaultMessage:
      'This action will delete ALL application data, including interviews and protocols. This action cannot be undone. Do you want to continue?',
    description:
      'Body text of the dialog that confirms deleting all data on the installation. Warns that interviews and protocols are lost for good; ALL is emphasised.',
  },
});

const ResetButton = () => {
  const intl = useAppIntl();

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  return (
    <>
      <Button
        type="submit"
        color="destructive"
        onClick={() => setShowConfirmDialog(true)}
        className="h-auto min-h-12 py-2 text-center text-wrap"
      >
        {intl.formatMessage(messages.resetAllAppData)}
      </Button>
      <Dialog
        accent="destructive"
        open={showConfirmDialog}
        closeDialog={() => setShowConfirmDialog(false)}
        // The reset runs to completion once started, so leaving mid-way would
        // look like a cancel while every protocol and interview is deleted.
        dismissible={!isResetting}
        title={intl.formatMessage(messages.areYouSure)}
        description={intl.formatMessage(
          messages.thisActionWillDeleteALLApplicationData,
        )}
        footer={
          <>
            <Button
              onClick={() => setShowConfirmDialog(false)}
              disabled={isResetting}
            >
              {intl.formatMessage(commonMessages.cancel)}
            </Button>
            <Button
              disabled={isResetting}
              onClick={async () => {
                setIsResetting(true);
                try {
                  await resetAppSettings();
                } catch {
                  // Success redirects to setup, so the flag is only cleared
                  // on failure: clearing it on success would briefly reopen
                  // the dialog to dismissal before the navigation lands.
                  setIsResetting(false);
                }
              }}
              color="primary"
            >
              {isResetting && <Loader2 className="me-2 size-5 animate-spin" />}
              {isResetting
                ? intl.formatMessage(messages.copyResetting)
                : intl.formatMessage(messages.copyDeleteAllData)}
            </Button>
          </>
        }
      ></Dialog>
    </>
  );
};

export default ResetButton;
