import { useId } from 'react';

import { commonMessages } from '@codaco/app-i18n/common';
import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { useAuth } from '~/lib/auth/AuthContext';

const messages = defineMessages({
  resetAllAppData: {
    id: 'interviewer.recoverByResettingDialog.resetAllAppData',
    defaultMessage: 'Reset all app data?',
    description: 'The title label in Interviewer Recover By Resetting Dialog.',
  },
  thisPermanentlyDeletesEveryProtocolAndRecorded: {
    id: 'interviewer.recoverByResettingDialog.thisPermanentlyDeletesEveryProtocolAndRecorded',
    defaultMessage:
      'This permanently deletes every protocol and recorded interview on this device. It cannot be undone, and the existing data cannot be recovered.',
    description:
      'The description label in Interviewer Recover By Resetting Dialog.',
  },
  permanentlyDelete: {
    id: 'interviewer.recoverByResettingDialog.permanentlyDelete',
    defaultMessage: 'Permanently delete',
    description: 'Visible copy in Interviewer Recover By Resetting Dialog.',
  },
  deleting: {
    id: 'interviewer.recoverByResettingDialog.deleting',
    defaultMessage: 'Deleting…',
    description:
      'The submittingText label in Interviewer Recover By Resetting Dialog.',
  },
  theAppDataCouldNotBeReset: {
    id: 'interviewer.recoverByResettingDialog.theAppDataCouldNotBeReset',
    defaultMessage: 'The app data could not be reset.',
    description:
      'User-facing message in Interviewer Recover By Resetting Dialog.',
  },
});

export type RecoverByResettingDialogProps = {
  open: boolean;
  onCancel: () => void;
  onReset?: () => void;
};

/**
 * The shared destructive recovery flow used wherever Interviewer must offer a
 * completely fresh start. Resetting deletes all locally stored app data and
 * revokes the current authenticator.
 */
export function RecoverByResettingDialog({
  open,
  onCancel,
  onReset,
}: RecoverByResettingDialogProps) {
  if (!open) return null;

  return (
    <FormStoreProvider>
      <RecoverByResettingDialogContent onCancel={onCancel} onReset={onReset} />
    </FormStoreProvider>
  );
}

function RecoverByResettingDialogContent({
  onCancel,
  onReset,
}: Omit<RecoverByResettingDialogProps, 'open'>) {
  const intl = useAppIntl();
  const { revoke } = useAuth();
  const formId = useId();
  const isSubmitting = useFormStore((state) => state.isSubmitting);
  const cancel = () => {
    if (!isSubmitting) onCancel();
  };

  return (
    <Dialog
      open
      title={intl.formatMessage(messages.resetAllAppData)}
      description={intl.formatMessage(
        messages.thisPermanentlyDeletesEveryProtocolAndRecorded,
      )}
      accent="destructive"
      closeDialog={cancel}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button type="button" disabled={isSubmitting} onClick={cancel}>
            {intl.formatMessage(commonMessages.cancel)}
          </Button>
          <SubmitButton
            form={formId}
            color="destructive"
            submittingText={intl.formatMessage(messages.deleting)}
          >
            {intl.formatMessage(messages.permanentlyDelete)}
          </SubmitButton>
        </>
      }
    >
      <FormWithoutProvider
        id={formId}
        onSubmit={async (): Promise<FormSubmissionResult> => {
          try {
            await revoke();
            onReset?.();
            return { success: true };
          } catch (error) {
            console.error('App data reset failed', error);
            return {
              success: false,
              formErrors: [
                createMessageError(messages.theAppDataCouldNotBeReset),
              ],
            };
          }
        }}
      >
        <></>
      </FormWithoutProvider>
    </Dialog>
  );
}
