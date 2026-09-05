import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { AuthenticationDialog } from '~/components/UnlockForms/AuthenticationDialog';

const messages = defineMessages({
  confirmYourIdentity: {
    id: 'interviewer.stepUpAuthDialog.confirmYourIdentity',
    defaultMessage: 'Confirm your identity',
    description: 'The title label in Interviewer Step Up Auth Dialog.',
  },
  authenticateToContinue: {
    id: 'interviewer.stepUpAuthDialog.authenticateToContinue',
    defaultMessage: 'Authenticate to continue.',
    description: 'The description label in Interviewer Step Up Auth Dialog.',
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
