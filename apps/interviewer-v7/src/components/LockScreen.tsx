import type { ReactNode } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

import BiometricUnlockForm from './UnlockForms/BiometricUnlockForm';
import PasswordUnlockForm from './UnlockForms/PasswordUnlockForm';
import PinUnlockForm from './UnlockForms/PinUnlockForm';

export function LockScreen() {
  const {
    kind,
    mode,
    unlockWithAuthenticator,
    unlockWithPin,
    unlockWithBiometricNative,
    unlockWithPassphrase,
  } = useAuth();

  if (kind !== 'locked') return null;

  let formContent: ReactNode = null;
  let leadText = 'Authenticate to unlock this device and resume your work.';

  switch (mode) {
    case 'webauthn':
      formContent = (
        <BiometricUnlockForm
          onSubmit={(signal) => unlockWithAuthenticator(signal)}
        />
      );
      break;
    case 'biometric-native':
      formContent = (
        <BiometricUnlockForm onSubmit={() => unlockWithBiometricNative()} />
      );
      break;
    case 'pin':
      leadText = 'Enter your PIN to unlock this device.';
      formContent = (
        <PinUnlockForm
          onSubmit={async (pin) => {
            const result = await unlockWithPin(pin);
            return result.ok
              ? { success: true }
              : {
                  success: false,
                  formErrors: [result.message ?? 'Incorrect PIN.'],
                };
          }}
        />
      );
      break;
    case 'passphrase':
      leadText = 'Enter your passphrase to unlock this device.';
      formContent = (
        <PasswordUnlockForm
          onSubmit={async (phrase) => {
            const result = await unlockWithPassphrase(phrase);
            return result.ok
              ? { success: true }
              : {
                  success: false,
                  formErrors: [result.message ?? 'Incorrect passphrase.'],
                };
          }}
        />
      );
      break;
    case 'none':
    case undefined:
      return null;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Surface level={1} spacing="lg" maxWidth="sm">
        <Heading level="h1">Device locked</Heading>
        <Paragraph intent="lead">{leadText}</Paragraph>
        {formContent}
      </Surface>
    </div>
  );
}
