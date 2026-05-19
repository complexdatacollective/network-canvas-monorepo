import type { ReactNode } from 'react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

import BiometricUnlockForm from './UnlockForms/BiometricUnlockForm';
import PasswordUnlockForm from './UnlockForms/PasswordUnlockForm';
import PinUnlockForm from './UnlockForms/PinUnlockForm';

export function LockScreen() {
  const { kind, mode, unlockWithAuthenticator, unlockWithPin } = useAuth();

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
        <BiometricUnlockForm
          onSubmit={() => authApi.unlockWithBiometricNative()}
        />
      );
      break;
    case 'pin':
      leadText = 'Enter your PIN to unlock this device.';
      formContent = <PinUnlockForm onSubmit={(pin) => unlockWithPin(pin)} />;
      break;
    case 'passphrase':
      leadText = 'Enter your passphrase to unlock this device.';
      formContent = (
        <PasswordUnlockForm
          onSubmit={(phrase) => authApi.unlockWithPassphrase(phrase)}
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
