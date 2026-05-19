import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import BiometricUnlockForm from '~/components/UnlockForms/BiometricUnlockForm';
import PasswordUnlockForm from '~/components/UnlockForms/PasswordUnlockForm';
import PinUnlockForm from '~/components/UnlockForms/PinUnlockForm';

import * as authApi from './api';
import { useAuth } from './AuthContext';

export type StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' };

type StepUpAuthDialogProps = {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
};

export default function StepUpAuthDialog({
  open,
  onResolve,
}: StepUpAuthDialogProps) {
  const { mode } = useAuth();

  const handleCancel = () => {
    onResolve({ ok: false, reason: 'cancelled' });
  };

  const renderForm = () => {
    if (mode === 'webauthn' || mode === 'biometric-native') {
      return (
        <BiometricUnlockForm
          submitLabel="Verify identity"
          onSubmit={async (signal) => {
            const result = await authApi.verifyBiometric(signal);
            if (result.ok) {
              onResolve({ ok: true });
            }
            return result;
          }}
        />
      );
    }

    if (mode === 'pin') {
      return (
        <PinUnlockForm
          submitLabel="Verify"
          onSubmit={async (pin) => {
            const result = await authApi.verifyWithPin(pin);
            if (result.ok) {
              onResolve({ ok: true });
              return { success: true };
            }
            return {
              success: false,
              formErrors: [result.message ?? 'Incorrect PIN.'],
            };
          }}
        />
      );
    }

    if (mode === 'passphrase') {
      return (
        <PasswordUnlockForm
          submitLabel="Verify"
          onSubmit={async (phrase) => {
            const result = await authApi.verifyWithPassphrase(phrase);
            if (result.ok) {
              onResolve({ ok: true });
              return { success: true };
            }
            return {
              success: false,
              formErrors: [result.message ?? 'Incorrect passphrase.'],
            };
          }}
        />
      );
    }

    return null;
  };

  return (
    <Dialog
      open={open}
      closeDialog={handleCancel}
      title="Confirm your identity"
    >
      {renderForm()}
    </Dialog>
  );
}
