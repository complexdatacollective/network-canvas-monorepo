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
    description: 'Researcher-facing ResetButton: Resetting...',
  },
  copyDeleteAllData: {
    id: 'fresco.ResetButton.copyDeleteAllData',
    defaultMessage: 'Delete all data',
    description: 'Researcher-facing ResetButton: Delete all data',
  },
  resetAllAppData: {
    id: 'fresco.ResetButton.resetAllAppData',
    defaultMessage: 'Reset all app data',
    description: 'Researcher-facing ResetButton: Reset all app data',
  },
  areYouSure: {
    id: 'fresco.ResetButton.areYouSure',
    defaultMessage: 'Are you sure?',
    description: 'Researcher-facing ResetButton: Are you sure?',
  },
  thisActionWillDeleteALLApplicationData: {
    id: 'fresco.ResetButton.thisActionWillDeleteALLApplicationData',
    defaultMessage:
      'This action will delete ALL application data, including interviews and protocols. This action cannot be undone. Do you want to continue?',
    description:
      'Researcher-facing ResetButton: This action will delete ALL application data, including interviews and protocols. This action cannot be undone. Do you w',
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
      >
        {intl.formatMessage(messages.resetAllAppData)}
      </Button>
      <Dialog
        accent="destructive"
        open={showConfirmDialog}
        closeDialog={() => setShowConfirmDialog(false)}
        title={intl.formatMessage(messages.areYouSure)}
        description={intl.formatMessage(
          messages.thisActionWillDeleteALLApplicationData,
        )}
        footer={
          <>
            <Button onClick={() => setShowConfirmDialog(false)}>
              {intl.formatMessage(commonMessages.cancel)}
            </Button>
            <Button
              disabled={isResetting}
              onClick={async () => {
                setIsResetting(true);
                try {
                  await resetAppSettings();
                } catch {
                  setIsResetting(false);
                }
              }}
              color="primary"
            >
              {isResetting && <Loader2 className="mr-2 size-5 animate-spin" />}
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
