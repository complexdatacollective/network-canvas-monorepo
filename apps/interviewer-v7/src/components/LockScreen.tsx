import { useId, useRef } from 'react';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { useAuth } from '~/lib/auth/AuthContext';

import BiometricUnlockForm from './UnlockForms/BiometricUnlockForm';
import PasswordUnlockField from './UnlockForms/PasswordUnlockField';
import PinUnlockField from './UnlockForms/PinUnlockField';

function PinLockBody({
  onSubmit,
}: {
  onSubmit: (pin: string) => Promise<FormSubmissionResult>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const formId = useId();

  return (
    <FormStoreProvider>
      <Dialog
        open
        dismissible={false}
        title="Device locked"
        description="Enter your PIN to unlock this device."
        footer={
          <SubmitButton form={formId} submittingText="Unlocking…">
            Unlock
          </SubmitButton>
        }
      >
        <FormWithoutProvider
          id={formId}
          ref={formRef}
          onSubmit={(values) =>
            onSubmit(typeof values.pin === 'string' ? values.pin : '')
          }
        >
          <PinUnlockField
            autoFocus
            onComplete={() => formRef.current?.requestSubmit()}
          />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}

function PassphraseLockBody({
  onSubmit,
}: {
  onSubmit: (phrase: string) => Promise<FormSubmissionResult>;
}) {
  const formId = useId();

  return (
    <FormStoreProvider>
      <Dialog
        open
        dismissible={false}
        title="Device locked"
        description="Enter your passphrase to unlock this device."
        footer={
          <SubmitButton form={formId} submittingText="Unlocking…">
            Unlock
          </SubmitButton>
        }
      >
        <FormWithoutProvider
          id={formId}
          onSubmit={(values) =>
            onSubmit(
              typeof values.passphrase === 'string' ? values.passphrase : '',
            )
          }
        >
          <PasswordUnlockField autoFocus />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}

function BiometricLockDialog({
  onSubmit,
}: {
  onSubmit: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  return (
    <Dialog
      open
      dismissible={false}
      title="Device locked"
      description="Authenticate to unlock this device and resume your work."
    >
      <BiometricUnlockForm onSubmit={onSubmit} />
    </Dialog>
  );
}

export function LockScreen() {
  const {
    kind,
    mode,
    unlockWithAuthenticator,
    unlockWithPin,
    unlockWithBiometricNative,
    unlockWithPassphrase,
  } = useAuth();

  if (kind !== 'locked') {
    return null;
  }

  switch (mode) {
    case 'webauthn':
      return (
        <BiometricLockDialog
          onSubmit={(signal) => unlockWithAuthenticator(signal)}
        />
      );
    case 'biometric-native':
      return (
        <BiometricLockDialog onSubmit={() => unlockWithBiometricNative()} />
      );
    case 'pin':
      return (
        <PinLockBody
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
    case 'passphrase':
      return (
        <PassphraseLockBody
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
    case 'none':
    case undefined:
      return null;
    default:
      return null;
  }
}
