import { useRef, useState } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import type { AuthResult } from '~/lib/auth/api';

import PinUnlockField from './PinUnlockField';

const messages = defineMessages({
  incorrectPIN: {
    id: 'interviewer.pinUnlockForm.incorrectPIN',
    defaultMessage: 'Incorrect PIN.',
    description: 'User-facing message in Interviewer Pin Unlock Form.',
  },
});

type PinUnlockFormProps = {
  formId: string;
  verifyPin: (pin: string) => Promise<AuthResult>;
};

export function PinUnlockForm({ formId, verifyPin }: PinUnlockFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const setFieldValue = useFormStore((store) => store.setFieldValue);
  const [attempt, setAttempt] = useState(0);

  return (
    <FormWithoutProvider
      id={formId}
      ref={formRef}
      onSubmit={async (values): Promise<FormSubmissionResult> => {
        const pin = typeof values.pin === 'string' ? values.pin : '';
        const result = await verifyPin(pin);
        if (result.ok) {
          return { success: true };
        }
        // Clear the entered code and remount the field so the first segment
        // re-focuses (via autoFocus), letting the user retype immediately.
        setFieldValue('pin', '');
        setAttempt((count) => count + 1);
        return {
          success: false,
          formErrors: [
            createMessageError(
              result.localizedMessage?.descriptor ?? messages.incorrectPIN,
              result.localizedMessage?.values,
            ),
          ],
        };
      }}
    >
      <PinUnlockField
        key={attempt}
        autoFocus
        onComplete={() => formRef.current?.requestSubmit()}
      />
    </FormWithoutProvider>
  );
}
