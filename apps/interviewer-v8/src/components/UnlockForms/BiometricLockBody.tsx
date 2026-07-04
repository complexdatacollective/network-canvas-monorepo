import { Fingerprint, RectangleEllipsis } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

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
import { ResetAppDataButton } from './ResetAppDataButton';
import { UnlockEmblem } from './UnlockEmblem';
import { UnlockLayout } from './UnlockLayout';

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

  // Best-effort auto-unlock: try biometrics once on mount so the common case
  // (a gesture is available, e.g. after a reload or refocus) needs zero clicks.
  // WebAuthn `navigator.credentials.get()` generally requires a user gesture;
  // after an idle/blur lock there is none, and Safari/WebKit rejects the
  // auto-call — so this is best-effort and the "Unlock with biometrics" button
  // stays as the fallback. Skip when `limited` (macOS-Chromium installed PWA
  // can't reach the passkey) or in recovery. The ref guards against React
  // re-renders / StrictMode double-mount and recovery↔biometric toggling
  // re-firing the prompt. A failed/cancelled attempt resolves to { ok:false }
  // and is intentionally silent — only the explicit button surfaces errors.
  const autoAttempted = useRef(false);
  useEffect(() => {
    if (limited || useRecovery || autoAttempted.current) {
      return;
    }
    autoAttempted.current = true;
    void unlockWithBiometric().catch(() => {});
  }, [limited, useRecovery, unlockWithBiometric]);

  if (useRecovery) {
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
              >
                Unlock
              </SubmitButton>
            </>
          }
        >
          <UnlockLayout
            emblem={
              <UnlockEmblem icon={RectangleEllipsis} seed="recovery-unlock" />
            }
          >
            <Paragraph emphasis="muted">
              {limited
                ? "Biometric unlock isn't available in the installed app on macOS. Enter your recovery passphrase to unlock."
                : 'Enter your recovery passphrase to unlock.'}
            </Paragraph>
            <FormWithoutProvider
              id={formId}
              onSubmit={async (values): Promise<FormSubmissionResult> => {
                const phrase =
                  typeof values.passphrase === 'string'
                    ? values.passphrase
                    : '';
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
          </UnlockLayout>
        </Dialog>
      </FormStoreProvider>
    );
  }

  return (
    <Dialog
      open
      dismissible={false}
      title={LOCK_TITLE}
      footer={<ResetAppDataButton />}
    >
      <UnlockLayout
        emblem={<UnlockEmblem icon={Fingerprint} seed="biometric-unlock" />}
      >
        <Paragraph emphasis="muted">
          Authenticate to unlock and pick up where you left off.
        </Paragraph>
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
      </UnlockLayout>
    </Dialog>
  );
}
