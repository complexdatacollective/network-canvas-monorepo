import { AuthenticationDialog } from '~/components/UnlockForms/AuthenticationDialog';

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
  return (
    <AuthenticationDialog
      open={open}
      title="Confirm your identity"
      description="Authenticate to continue."
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
