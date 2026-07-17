import { Fingerprint, KeyRound, RectangleEllipsis } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { AuthMode, AuthResult } from '~/lib/auth/api';
import { hasPasskeyWindowLimitation } from '~/lib/pwa/passkeyWindowLimitation';

import BiometricUnlockForm from './BiometricUnlockForm';
import PasswordUnlockField from './PasswordUnlockField';
import { PinUnlockForm } from './PinUnlockForm';
import { UnlockEmblem } from './UnlockEmblem';
import { UnlockLayout } from './UnlockLayout';

export type AuthenticationDialogCopy = {
  title: string;
  pinDescription: string;
  passphraseDescription: string;
  biometricDescription: string;
  recoveryDescription: string;
  limitedRecoveryDescription: string;
};

type AuthenticationDialogProps = {
  mode: AuthMode | undefined;
  open?: boolean;
  copy: AuthenticationDialogCopy;
  onCancel?: () => void;
  onAuthenticated?: () => void;
  authenticateWithPin: (pin: string) => Promise<AuthResult>;
  authenticateWithPassphrase: (phrase: string) => Promise<AuthResult>;
  authenticateBiometric: () => Promise<AuthResult>;
  authenticateWithRecovery: (phrase: string) => Promise<AuthResult>;
  secondaryAction?: ReactNode;
  autoAttemptBiometric?: boolean;
  limited?: boolean;
};

export function AuthenticationDialog({
  mode,
  open = true,
  copy,
  onCancel,
  onAuthenticated = () => {},
  authenticateWithPin,
  authenticateWithPassphrase,
  authenticateBiometric,
  authenticateWithRecovery,
  secondaryAction,
  autoAttemptBiometric = false,
  limited = hasPasskeyWindowLimitation(),
}: AuthenticationDialogProps) {
  const [useRecovery, setUseRecovery] = useState(limited);
  const autoAttempted = useRef(false);
  const formId = useId();

  useEffect(() => {
    if (
      mode !== 'biometric' ||
      !open ||
      !autoAttemptBiometric ||
      limited ||
      useRecovery ||
      autoAttempted.current
    ) {
      return;
    }

    autoAttempted.current = true;
    void authenticateBiometric()
      .then((result) => {
        if (result.ok) onAuthenticated();
        return undefined;
      })
      .catch(() => {});
  }, [
    authenticateBiometric,
    autoAttemptBiometric,
    limited,
    mode,
    onAuthenticated,
    open,
    useRecovery,
  ]);

  if (mode === 'none' || mode === undefined) {
    return null;
  }

  const dialogProps = {
    open,
    title: copy.title,
    closeDialog: onCancel,
    dismissible: onCancel !== undefined,
  };

  if (mode === 'pin') {
    return (
      <FormStoreProvider>
        <Dialog
          {...dialogProps}
          footer={
            <>
              {secondaryAction}
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
            <Paragraph emphasis="muted">{copy.pinDescription}</Paragraph>
            <PinUnlockForm
              formId={formId}
              verifyPin={async (pin) => {
                const result = await authenticateWithPin(pin);
                if (result.ok) onAuthenticated();
                return result;
              }}
            />
          </UnlockLayout>
        </Dialog>
      </FormStoreProvider>
    );
  }

  if (mode === 'passphrase') {
    return (
      <FormStoreProvider>
        <Dialog
          {...dialogProps}
          footer={
            <>
              {secondaryAction}
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
            <Paragraph emphasis="muted">{copy.passphraseDescription}</Paragraph>
            <FormWithoutProvider
              id={formId}
              onSubmit={async (values): Promise<FormSubmissionResult> => {
                const phrase =
                  typeof values.passphrase === 'string'
                    ? values.passphrase
                    : '';
                const result = await authenticateWithPassphrase(phrase);
                if (result.ok) {
                  onAuthenticated();
                  return { success: true };
                }
                return {
                  success: false,
                  formErrors: [result.message ?? 'Incorrect passphrase.'],
                };
              }}
            >
              <PasswordUnlockField autoFocus />
            </FormWithoutProvider>
          </UnlockLayout>
        </Dialog>
      </FormStoreProvider>
    );
  }

  if (useRecovery) {
    return (
      <FormStoreProvider>
        <Dialog
          {...dialogProps}
          footer={
            <>
              {secondaryAction}
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
                ? copy.limitedRecoveryDescription
                : copy.recoveryDescription}
            </Paragraph>
            <FormWithoutProvider
              id={formId}
              onSubmit={async (values): Promise<FormSubmissionResult> => {
                const phrase =
                  typeof values.passphrase === 'string'
                    ? values.passphrase
                    : '';
                const result = await authenticateWithRecovery(phrase);
                if (result.ok) {
                  onAuthenticated();
                  return { success: true };
                }
                return {
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
    <Dialog {...dialogProps} footer={secondaryAction}>
      <UnlockLayout
        emblem={<UnlockEmblem icon={Fingerprint} seed="biometric-unlock" />}
      >
        <Paragraph emphasis="muted">{copy.biometricDescription}</Paragraph>
        <BiometricUnlockForm
          submitLabel="Unlock with biometrics"
          onSubmit={async () => {
            const result = await authenticateBiometric();
            if (result.ok) onAuthenticated();
            return result;
          }}
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
