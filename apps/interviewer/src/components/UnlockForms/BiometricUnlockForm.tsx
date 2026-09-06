import { type ReactNode, createElement, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { LocalizedMessage } from '~/i18n/messageResult';

const messages = defineMessages({
  unlockWithAuthenticator: {
    id: 'interviewer.biometricUnlockForm.unlockWithAuthenticator',
    defaultMessage: 'Unlock with authenticator',
    description: 'User-facing message in Interviewer Biometric Unlock Form.',
  },
  unlockFailed: {
    id: 'interviewer.biometricUnlockForm.unlockFailed',
    defaultMessage: 'Unlock failed',
    description: 'User-facing message in Interviewer Biometric Unlock Form.',
  },
  waitingForAuthenticator: {
    id: 'interviewer.biometricUnlockForm.waitingForAuthenticator',
    defaultMessage: 'Waiting for authenticator…',
    description: 'User-facing message in Interviewer Biometric Unlock Form.',
  },
});

type BiometricUnlockFormProps = {
  onSubmit: () => Promise<{
    ok: boolean;
    message?: string;
    localizedMessage?: LocalizedMessage;
  }>;
  submitLabel?: string;
  disabled?: boolean;
};

export default function BiometricUnlockForm({
  onSubmit,
  submitLabel,
  disabled,
}: BiometricUnlockFormProps) {
  const intl = useAppIntl();
  const [error, setError] = useState<ReactNode>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    setSubmitting(true);
    setError(null);
    const result = await onSubmit();
    setSubmitting(false);
    if (!result.ok) {
      setError(
        createElement(AppMessage, {
          message: result.localizedMessage?.descriptor ?? messages.unlockFailed,
          values: result.localizedMessage?.values,
        }),
      );
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        color="primary"
        onClick={() => void handleClick()}
        disabled={disabled ?? submitting}
      >
        {submitting
          ? intl.formatMessage(messages.waitingForAuthenticator)
          : (submitLabel ??
            intl.formatMessage(messages.unlockWithAuthenticator))}
      </Button>
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
    </div>
  );
}
