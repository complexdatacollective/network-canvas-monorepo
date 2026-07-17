import type { AuthMode, AuthResult } from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

import {
  AuthenticationDialog,
  type AuthenticationDialogCopy,
} from './UnlockForms/AuthenticationDialog';
import { ResetAppDataButton } from './UnlockForms/ResetAppDataButton';

const LOCK_DIALOG_COPY: AuthenticationDialogCopy = {
  title: 'Welcome back',
  pinDescription: 'Enter your PIN to unlock and pick up where you left off.',
  passphraseDescription:
    'Enter your passphrase to unlock and pick up where you left off.',
  biometricDescription:
    'Authenticate to unlock and pick up where you left off.',
  recoveryDescription: 'Enter your recovery passphrase to unlock.',
  limitedRecoveryDescription:
    "Biometric unlock isn't available in the installed app on macOS. Enter your recovery passphrase to unlock.",
};

export function LockScreenView({
  mode,
  unlockWithPin,
  unlockWithPassphrase,
  unlockWithBiometric,
  unlockWithRecovery,
}: {
  mode: AuthMode | undefined;
  unlockWithPin: (pin: string) => Promise<AuthResult>;
  unlockWithPassphrase: (phrase: string) => Promise<AuthResult>;
  unlockWithBiometric: () => Promise<AuthResult>;
  unlockWithRecovery: (phrase: string) => Promise<AuthResult>;
}) {
  return (
    <AuthenticationDialog
      mode={mode}
      copy={LOCK_DIALOG_COPY}
      authenticateWithPin={unlockWithPin}
      authenticateWithPassphrase={unlockWithPassphrase}
      authenticateBiometric={unlockWithBiometric}
      authenticateWithRecovery={unlockWithRecovery}
      secondaryAction={<ResetAppDataButton />}
      autoAttemptBiometric
    />
  );
}

export function LockScreen() {
  const {
    kind,
    mode,
    unlockWithPin,
    unlockWithPassphrase,
    unlockWithBiometric,
    unlockWithRecovery,
  } = useAuth();

  if (kind !== 'locked') {
    return null;
  }

  return (
    <LockScreenView
      mode={mode}
      unlockWithPin={unlockWithPin}
      unlockWithPassphrase={unlockWithPassphrase}
      unlockWithBiometric={unlockWithBiometric}
      unlockWithRecovery={unlockWithRecovery}
    />
  );
}
