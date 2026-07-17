import Button from '@codaco/fresco-ui/Button';
import {
  AuthenticationDialog,
  type AuthenticationDialogCopy,
} from '~/components/UnlockForms/AuthenticationDialog';
import { hasPasskeyWindowLimitation } from '~/lib/pwa/passkeyWindowLimitation';

import * as authApi from './api';
import type { AuthMode, AuthResult } from './api';
import { useAuth } from './AuthContext';

export type StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' };

type StepUpAuthDialogProps = {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
};

const STEP_UP_DIALOG_COPY: AuthenticationDialogCopy = {
  title: 'Confirm your identity',
  pinDescription: 'Enter your PIN to continue.',
  passphraseDescription: 'Enter your passphrase to continue.',
  biometricDescription: 'Authenticate to continue.',
  recoveryDescription: 'Enter your recovery passphrase to continue.',
  limitedRecoveryDescription:
    "Biometric unlock isn't available in the installed app on macOS. Enter your recovery passphrase to continue.",
};

export function StepUpAuthDialogView({
  mode,
  open,
  onResolve,
  onCancel,
  verifyWithPin,
  verifyWithPassphrase,
  verifyBiometric,
  verifyWithRecovery,
  limited = hasPasskeyWindowLimitation(),
}: {
  mode: AuthMode | undefined;
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  onCancel: () => void;
  verifyWithPin: (pin: string) => Promise<AuthResult>;
  verifyWithPassphrase: (phrase: string) => Promise<AuthResult>;
  verifyBiometric: () => Promise<AuthResult>;
  verifyWithRecovery: (phrase: string) => Promise<AuthResult>;
  limited?: boolean;
}) {
  return (
    <AuthenticationDialog
      mode={mode}
      open={open}
      copy={STEP_UP_DIALOG_COPY}
      onCancel={onCancel}
      onAuthenticated={() => onResolve({ ok: true })}
      authenticateWithPin={verifyWithPin}
      authenticateWithPassphrase={verifyWithPassphrase}
      authenticateBiometric={verifyBiometric}
      authenticateWithRecovery={verifyWithRecovery}
      secondaryAction={
        <Button
          type="button"
          color="secondary"
          className="mr-auto"
          onClick={onCancel}
        >
          Cancel
        </Button>
      }
      limited={limited}
    />
  );
}

export default function StepUpAuthDialog({
  open,
  onResolve,
}: StepUpAuthDialogProps) {
  const { mode } = useAuth();
  const handleCancel = () =>
    onResolve({ ok: false, reason: 'cancelled' } as const);

  return (
    <StepUpAuthDialogView
      mode={mode}
      open={open}
      onResolve={onResolve}
      onCancel={handleCancel}
      verifyWithPin={authApi.verifyWithPin}
      verifyWithPassphrase={authApi.verifyWithPassphrase}
      verifyBiometric={authApi.verifyBiometric}
      verifyWithRecovery={authApi.verifyWithRecovery}
    />
  );
}
