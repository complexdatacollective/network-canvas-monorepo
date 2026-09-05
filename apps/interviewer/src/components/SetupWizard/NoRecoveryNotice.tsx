import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

const messages = defineMessages({
  noRecovery: {
    id: 'interviewer.noRecoveryNotice.noRecovery',
    defaultMessage: 'No recovery',
    description: 'Visible copy in Interviewer No Recovery Notice.',
  },
  biometric: {
    id: 'interviewer.noRecoveryNotice.biometric',
    defaultMessage:
      'Biometric unlock is protected by a recovery passphrase you set during setup. Keep that passphrase safe: if you lose both your biometric and the recovery passphrase, data on this device cannot be recovered.',
    description: 'Administration text in Interviewer NoRecoveryNotice.',
  },
  pin: {
    id: 'interviewer.noRecoveryNotice.pin',
    defaultMessage:
      "If you forget your PIN, all data on this device — including imported protocols and recorded interviews — will become permanently inaccessible. There is no way to recover, reset, or bypass app security. The 'Reset all app data' menu option lets you start over with a blank app, but existing data cannot be recovered.",
    description: 'Administration text in Interviewer NoRecoveryNotice.',
  },
  passphrase: {
    id: 'interviewer.noRecoveryNotice.passphrase',
    defaultMessage:
      "If you forget your passphrase, all data on this device — including imported protocols and recorded interviews — will become permanently inaccessible. There is no way to recover, reset, or bypass app security. The 'Reset all app data' menu option lets you start over with a blank app, but existing data cannot be recovered.",
    description: 'Administration text in Interviewer NoRecoveryNotice.',
  },
});

type Method = 'pin' | 'passphrase' | 'biometric';

const COPY: Record<Method, MessageDescriptor> = {
  pin: messages.pin,
  passphrase: messages.passphrase,
  biometric: messages.biometric,
};

export default function NoRecoveryNotice({ method }: { method: Method }) {
  const intl = useAppIntl();
  return (
    <Alert variant="warning">
      <AlertTitle>{intl.formatMessage(messages.noRecovery)}</AlertTitle>
      <AlertDescription>{intl.formatMessage(COPY[method])}</AlertDescription>
    </Alert>
  );
}
