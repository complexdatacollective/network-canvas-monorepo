import { Fingerprint, KeyRound, RectangleEllipsis } from 'lucide-react';
import { useId, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import BiometricUnlockForm from '~/components/UnlockForms/BiometricUnlockForm';
import PasswordUnlockField from '~/components/UnlockForms/PasswordUnlockField';
import { PinUnlockForm } from '~/components/UnlockForms/PinUnlockForm';
import { UnlockEmblem } from '~/components/UnlockForms/UnlockEmblem';
import { hasPasskeyWindowLimitation } from '~/lib/pwa/passkeyWindowLimitation';

import * as authApi from './api';
import type { AuthMode, AuthResult } from './api';
import { useAuth } from './AuthContext';

export type StepUpResult = { ok: true } | { ok: false; reason: 'cancelled' };

type StepUpAuthDialogProps = {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
};

function PinStepUp({
  open,
  onResolve,
  handleCancel,
  verifyWithPin,
}: {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  handleCancel: () => void;
  verifyWithPin: (pin: string) => Promise<AuthResult>;
}) {
  const formId = useId();

  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={handleCancel}
        title="Confirm your identity"
        footer={
          <SubmitButton form={formId} submittingText="Verifying…">
            Verify
          </SubmitButton>
        }
      >
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <UnlockEmblem icon={KeyRound} seed="pin-unlock" />
          <Paragraph margin="none" emphasis="muted">
            Enter your PIN to continue.
          </Paragraph>
        </div>
        <PinUnlockForm
          formId={formId}
          verifyPin={async (pin) => {
            const result = await verifyWithPin(pin);
            if (result.ok) onResolve({ ok: true });
            return result;
          }}
        />
      </Dialog>
    </FormStoreProvider>
  );
}

function PassphraseStepUp({
  open,
  onResolve,
  handleCancel,
  verifyWithPassphrase,
}: {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  handleCancel: () => void;
  verifyWithPassphrase: (phrase: string) => Promise<AuthResult>;
}) {
  const formId = useId();

  return (
    <FormStoreProvider>
      <Dialog
        open={open}
        closeDialog={handleCancel}
        title="Confirm your identity"
        footer={
          <SubmitButton form={formId} submittingText="Verifying…">
            Verify
          </SubmitButton>
        }
      >
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <UnlockEmblem icon={RectangleEllipsis} seed="passphrase-unlock" />
          <Paragraph margin="none" emphasis="muted">
            Enter your passphrase to continue.
          </Paragraph>
        </div>
        <FormWithoutProvider
          id={formId}
          onSubmit={async (values): Promise<FormSubmissionResult> => {
            const phrase =
              typeof values.passphrase === 'string' ? values.passphrase : '';
            const result = await verifyWithPassphrase(phrase);
            if (result.ok) {
              onResolve({ ok: true });
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
      </Dialog>
    </FormStoreProvider>
  );
}

function BiometricStepUp({
  open,
  onResolve,
  handleCancel,
  verifyBiometric,
  verifyWithRecovery,
  limited,
}: {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  handleCancel: () => void;
  verifyBiometric: () => Promise<AuthResult>;
  verifyWithRecovery: (phrase: string) => Promise<AuthResult>;
  limited: boolean;
}) {
  // Installed-PWA windows on macOS Chromium can't reach the enrolled passkey
  // (crbug.com/364926914), so land on the recovery passphrase there — without
  // this, the enter/exit/export gates would dead-end on a QR prompt.
  const [useRecovery, setUseRecovery] = useState(limited);
  const formId = useId();

  if (useRecovery) {
    return (
      <FormStoreProvider>
        <Dialog
          open={open}
          closeDialog={handleCancel}
          title="Confirm your identity"
          footer={
            <SubmitButton form={formId} submittingText="Verifying…">
              Verify
            </SubmitButton>
          }
        >
          <div className="mb-6 flex flex-col items-center gap-4 text-center">
            <UnlockEmblem icon={RectangleEllipsis} seed="recovery-unlock" />
            <Paragraph margin="none" emphasis="muted">
              {limited
                ? "Biometric unlock isn't available in the installed app on macOS. Enter your recovery passphrase to continue."
                : 'Enter your recovery passphrase to continue.'}
            </Paragraph>
          </div>
          <FormWithoutProvider
            id={formId}
            onSubmit={async (values): Promise<FormSubmissionResult> => {
              const phrase =
                typeof values.passphrase === 'string' ? values.passphrase : '';
              const result = await verifyWithRecovery(phrase);
              if (result.ok) {
                onResolve({ ok: true });
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
        </Dialog>
      </FormStoreProvider>
    );
  }

  return (
    <Dialog
      open={open}
      closeDialog={handleCancel}
      title="Confirm your identity"
    >
      <div className="mb-6 flex flex-col items-center gap-4 text-center">
        <UnlockEmblem icon={Fingerprint} seed="biometric-unlock" />
        <Paragraph margin="none" emphasis="muted">
          Authenticate to continue.
        </Paragraph>
      </div>
      <BiometricUnlockForm
        submitLabel="Verify identity"
        onSubmit={async () => {
          const result = await verifyBiometric();
          if (result.ok) {
            onResolve({ ok: true });
          }
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
    </Dialog>
  );
}

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
  if (mode === 'biometric')
    return (
      <BiometricStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={onCancel}
        verifyBiometric={verifyBiometric}
        verifyWithRecovery={verifyWithRecovery}
        limited={limited}
      />
    );
  if (mode === 'pin')
    return (
      <PinStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={onCancel}
        verifyWithPin={verifyWithPin}
      />
    );
  if (mode === 'passphrase')
    return (
      <PassphraseStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={onCancel}
        verifyWithPassphrase={verifyWithPassphrase}
      />
    );
  return null;
}

export default function StepUpAuthDialog({
  open,
  onResolve,
}: StepUpAuthDialogProps) {
  const { mode } = useAuth();
  return (
    <StepUpAuthDialogView
      mode={mode}
      open={open}
      onResolve={onResolve}
      onCancel={() => onResolve({ ok: false, reason: 'cancelled' })}
      verifyWithPin={authApi.verifyWithPin}
      verifyWithPassphrase={authApi.verifyWithPassphrase}
      verifyBiometric={authApi.verifyBiometric}
      verifyWithRecovery={authApi.verifyWithRecovery}
    />
  );
}
