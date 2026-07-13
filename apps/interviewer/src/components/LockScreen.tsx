import { KeyRound, RectangleEllipsis } from 'lucide-react';
import { useId } from 'react';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { AuthMode, AuthResult } from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

import { BiometricLockBody } from './UnlockForms/BiometricLockBody';
import PasswordUnlockField from './UnlockForms/PasswordUnlockField';
import { PinUnlockForm } from './UnlockForms/PinUnlockForm';
import { ResetAppDataButton } from './UnlockForms/ResetAppDataButton';
import { UnlockEmblem } from './UnlockForms/UnlockEmblem';
import { UnlockLayout } from './UnlockForms/UnlockLayout';

const LOCK_TITLE = 'Welcome back';

function PinLockBody({
  verifyPin,
}: {
  verifyPin: (pin: string) => Promise<AuthResult>;
}) {
  const formId = useId();

  return (
    <FormStoreProvider>
      <Dialog
        open
        dismissible={false}
        title={LOCK_TITLE}
        footer={
          <>
            <ResetAppDataButton />
            <SubmitButton
              form={formId}
              submittingText="Unlocking…"
              className="phone-landscape:self-center"
              data-testid="unlock-submit"
            >
              Unlock
            </SubmitButton>
          </>
        }
      >
        <UnlockLayout
          emblem={<UnlockEmblem icon={KeyRound} seed="pin-unlock" />}
        >
          <Paragraph emphasis="muted">
            Enter your PIN to unlock and pick up where you left off.
          </Paragraph>
          <PinUnlockForm formId={formId} verifyPin={verifyPin} />
        </UnlockLayout>
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
        title={LOCK_TITLE}
        footer={
          <>
            <ResetAppDataButton />
            <SubmitButton
              form={formId}
              submittingText="Unlocking…"
              className="phone-landscape:self-center"
              data-testid="unlock-submit"
            >
              Unlock
            </SubmitButton>
          </>
        }
      >
        <UnlockLayout
          emblem={
            <UnlockEmblem icon={RectangleEllipsis} seed="passphrase-unlock" />
          }
        >
          <Paragraph emphasis="muted">
            Enter your passphrase to unlock and pick up where you left off.
          </Paragraph>
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
        </UnlockLayout>
      </Dialog>
    </FormStoreProvider>
  );
}

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
  switch (mode) {
    case 'biometric':
      return (
        <BiometricLockBody
          unlockWithBiometric={unlockWithBiometric}
          unlockWithRecovery={unlockWithRecovery}
        />
      );
    case 'pin':
      return (
        <PinLockBody
          verifyPin={async (pin) => {
            const result = await unlockWithPin(pin);
            return result.ok
              ? { ok: true }
              : { ok: false, message: result.message ?? 'Incorrect PIN.' };
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
    default:
      return null;
  }
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
