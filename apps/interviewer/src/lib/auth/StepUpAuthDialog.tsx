import { AuthenticationDialog } from '~/components/UnlockForms/AuthenticationDialog';

export type StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' };

type StepUpAuthDialogProps = {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
};

export function StepUpAuthDialogView({
  open,
  onResolve,
  onCancel,
}: {
  open: boolean;
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
      onCancel={onCancel}
      onAuthenticated={() => onResolve({ ok: true })}
    />
  );
}

export default function StepUpAuthDialog({
  open,
  onResolve,
}: StepUpAuthDialogProps) {
  const handleCancel = () =>
    onResolve({ ok: false, reason: 'cancelled' } as const);

  return (
    <StepUpAuthDialogView
      open={open}
      onResolve={onResolve}
      onCancel={handleCancel}
    />
  );
}
