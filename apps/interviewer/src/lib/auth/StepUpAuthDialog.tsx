import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { AuthenticationDialog } from '~/components/UnlockForms/AuthenticationDialog';

const messages = defineMessages({
  confirmYourIdentity: {
    id: 'interviewer.stepUpAuthDialog.confirmYourIdentity',
    defaultMessage: 'Confirm your identity',
    description:
      'Title of the dialog that asks the researcher to unlock again before a sensitive action, such as starting, exiting or exporting an interview.',
  },
  authenticateToContinue: {
    id: 'interviewer.stepUpAuthDialog.authenticateToContinue',
    defaultMessage: 'Authenticate to continue.',
    description:
      'Instruction under the title of the confirm-identity dialog, asking the researcher to authenticate with their PIN, passphrase or biometrics to continue.',
  },
});

export type StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' };

type StepUpAuthDialogProps = {
  open: boolean;
  allowDestructiveRecovery: boolean;
  onResolve: (result: StepUpResult) => void;
};

export function StepUpAuthDialogView({
  open,
  allowDestructiveRecovery,
  onResolve,
  onCancel,
}: {
  open: boolean;
  allowDestructiveRecovery: boolean;
  onResolve: (result: StepUpResult) => void;
  onCancel: () => void;
}) {
  const intl = useAppIntl();
  return (
    <AuthenticationDialog
      open={open}
      title={intl.formatMessage(messages.confirmYourIdentity)}
      description={intl.formatMessage(messages.authenticateToContinue)}
      showCancel
      allowRecovery
      allowDestructiveRecovery={allowDestructiveRecovery}
      onCancel={onCancel}
      onAuthenticated={() => onResolve({ ok: true })}
    />
  );
}

export default function StepUpAuthDialog({
  open,
  allowDestructiveRecovery,
  onResolve,
}: StepUpAuthDialogProps) {
  const handleCancel = () => onResolve({ ok: false, reason: 'cancelled' });

  return (
    <StepUpAuthDialogView
      open={open}
      allowDestructiveRecovery={allowDestructiveRecovery}
      onResolve={onResolve}
      onCancel={handleCancel}
    />
  );
}
