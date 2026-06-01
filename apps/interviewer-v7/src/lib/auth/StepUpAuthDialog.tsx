import { useId, useRef } from 'react';

import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import BiometricUnlockForm from '~/components/UnlockForms/BiometricUnlockForm';
import PasswordUnlockField from '~/components/UnlockForms/PasswordUnlockField';
import PinUnlockField from '~/components/UnlockForms/PinUnlockField';

import * as authApi from './api';
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
}: {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  handleCancel: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
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
        <FormWithoutProvider
          id={formId}
          ref={formRef}
          onSubmit={async (values): Promise<FormSubmissionResult> => {
            const pin = typeof values.pin === 'string' ? values.pin : '';
            const result = await authApi.verifyWithPin(pin);
            if (result.ok) {
              onResolve({ ok: true });
              return { success: true };
            }
            return {
              success: false,
              formErrors: [result.message ?? 'Incorrect PIN.'],
            };
          }}
        >
          <PinUnlockField onComplete={() => formRef.current?.requestSubmit()} />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}

function PassphraseStepUp({
  open,
  onResolve,
  handleCancel,
}: {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  handleCancel: () => void;
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
        <FormWithoutProvider
          id={formId}
          onSubmit={async (values): Promise<FormSubmissionResult> => {
            const phrase =
              typeof values.passphrase === 'string' ? values.passphrase : '';
            const result = await authApi.verifyWithPassphrase(phrase);
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
          <PasswordUnlockField />
        </FormWithoutProvider>
      </Dialog>
    </FormStoreProvider>
  );
}

function BiometricStepUp({
  open,
  onResolve,
  handleCancel,
}: {
  open: boolean;
  onResolve: (result: StepUpResult) => void;
  handleCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      closeDialog={handleCancel}
      title="Confirm your identity"
    >
      <BiometricUnlockForm
        submitLabel="Verify identity"
        onSubmit={async (signal) => {
          const result = await authApi.verifyBiometric(signal);
          if (result.ok) {
            onResolve({ ok: true });
          }
          return result;
        }}
      />
    </Dialog>
  );
}

export default function StepUpAuthDialog({
  open,
  onResolve,
}: StepUpAuthDialogProps) {
  const { mode } = useAuth();

  const handleCancel = () => {
    onResolve({ ok: false, reason: 'cancelled' });
  };

  if (mode === 'biometric-keystore' || mode === 'biometric-native') {
    return (
      <BiometricStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={handleCancel}
      />
    );
  }

  if (mode === 'pin') {
    return (
      <PinStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={handleCancel}
      />
    );
  }

  if (mode === 'passphrase') {
    return (
      <PassphraseStepUp
        open={open}
        onResolve={onResolve}
        handleCancel={handleCancel}
      />
    );
  }

  return null;
}
