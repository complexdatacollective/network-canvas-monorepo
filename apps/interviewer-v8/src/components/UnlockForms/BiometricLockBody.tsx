import { Fingerprint, RectangleEllipsis } from 'lucide-react';
import { useId, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { hasPasskeyWindowLimitation } from '~/lib/pwa/passkeyWindowLimitation';

import BiometricUnlockForm from './BiometricUnlockForm';
import PasswordUnlockField from './PasswordUnlockField';
import { UnlockEmblem } from './UnlockEmblem';

const LOCK_TITLE = 'Welcome back';

type BiometricLockBodyProps = {
  unlockWithBiometric: () => Promise<{ ok: boolean; message?: string }>;
  unlockWithRecovery: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  // Installed-PWA windows on macOS Chromium can't reach the enrolled passkey
  // (crbug.com/364926914), so we land on recovery there. Defaults to the live
  // platform check; overridable so callers (and stories) can force the state.
  limited?: boolean;
};

export function BiometricLockBody({
  unlockWithBiometric,
  unlockWithRecovery,
  limited = hasPasskeyWindowLimitation(),
}: BiometricLockBodyProps) {
  const [useRecovery, setUseRecovery] = useState(limited);
  const formId = useId();

  if (useRecovery) {
    return (
      <FormStoreProvider>
        <Dialog
          open
          dismissible={false}
          title={LOCK_TITLE}
          footer={
            <SubmitButton form={formId} submittingText="Unlocking…">
              Unlock
            </SubmitButton>
          }
        >
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <UnlockEmblem icon={RectangleEllipsis} seed="recovery-unlock" />
            <Paragraph margin="none" emphasis="muted">
              {limited
                ? "Biometric unlock isn't available in the installed app on macOS. Enter your recovery passphrase to unlock."
                : 'Enter your recovery passphrase to unlock.'}
            </Paragraph>
          </div>
          <FormWithoutProvider
            id={formId}
            onSubmit={async (values): Promise<FormSubmissionResult> => {
              const phrase =
                typeof values.passphrase === 'string' ? values.passphrase : '';
              const result = await unlockWithRecovery(phrase);
              return result.ok
                ? { success: true }
                : {
                    success: false,
                    formErrors: [result.message ?? 'Incorrect passphrase.'],
                  };
            }}
          >
            <PasswordUnlockField autoFocus />
          </FormWithoutProvider>
          <Button
            type="button"
            color="secondary"
            className="mt-4"
            onClick={() => setUseRecovery(false)}
          >
            {limited ? 'Try biometrics anyway' : 'Back to biometrics'}
          </Button>
        </Dialog>
      </FormStoreProvider>
    );
  }

  return (
    <Dialog open dismissible={false} title={LOCK_TITLE}>
      <div className="mb-6 flex flex-col items-center gap-4 text-center">
        <UnlockEmblem icon={Fingerprint} seed="biometric-unlock" />
        <Paragraph margin="none" emphasis="muted">
          Authenticate to unlock and pick up where you left off.
        </Paragraph>
      </div>
      <BiometricUnlockForm
        submitLabel="Unlock with biometrics"
        onSubmit={() => unlockWithBiometric()}
      />
      <Button
        type="button"
        color="secondary"
        className="mt-4"
        onClick={() => setUseRecovery(true)}
      >
        Use recovery passphrase
      </Button>
    </Dialog>
  );
}
