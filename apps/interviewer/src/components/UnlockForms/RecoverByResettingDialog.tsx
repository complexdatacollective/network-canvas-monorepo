import { useId } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { useAuth } from '~/lib/auth/AuthContext';

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
  const { revoke } = useAuth();
  const formId = useId();
  const isSubmitting = useFormStore((state) => state.isSubmitting);
  const cancel = () => {
    if (!isSubmitting) onCancel();
  };

  return (
    <Dialog
      open
      title="Reset all app data?"
      description="This permanently deletes every protocol and recorded interview on this device. It cannot be undone, and the existing data cannot be recovered."
      accent="destructive"
      closeDialog={cancel}
      dismissible={!isSubmitting}
      footer={
        <>
          <Button type="button" disabled={isSubmitting} onClick={cancel}>
            Cancel
          </Button>
          <SubmitButton
            form={formId}
            color="destructive"
            submittingText="Deleting…"
          >
            Permanently delete
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
            return {
              success: false,
              formErrors: [
                error instanceof Error
                  ? error.message
                  : 'The app data could not be reset.',
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
