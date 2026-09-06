import { useEffect, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { hasPasskeyWindowLimitation } from '../pwa/passkeyWindowLimitation';
import { isBiometricSupported } from './api';

const messages = defineMessages({
  unsupported: {
    id: 'interviewer.biometric.unsupported',
    defaultMessage:
      'This browser or device does not support biometric unlock. Use a PIN or passphrase instead.',
    description: 'Administration text in Interviewer useBiometric.',
  },
  limitedWindow: {
    id: 'interviewer.biometric.limitedWindow',
    defaultMessage:
      "Biometric unlock isn't available in the installed app on macOS, because Chrome can't reach your Mac's saved passkeys from an app window. Use a PIN or passphrase instead.",
    description: 'Administration text in Interviewer useBiometric.',
  },
});

export type BiometricState =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string };

export function useBiometric(): BiometricState {
  const intl = useAppIntl();
  const [biometric, setBiometric] = useState<
    | { status: 'checking' | 'available' }
    | { status: 'unavailable'; reason: MessageDescriptor }
  >({
    status: 'checking',
  });

  useEffect(() => {
    let active = true;
    async function check() {
      if (hasPasskeyWindowLimitation()) {
        setBiometric({ status: 'unavailable', reason: messages.limitedWindow });
        return;
      }
      try {
        const supported = await isBiometricSupported();
        if (!active) return;
        setBiometric(
          supported
            ? { status: 'available' }
            : { status: 'unavailable', reason: messages.unsupported },
        );
      } catch {
        if (!active) return;
        setBiometric({ status: 'unavailable', reason: messages.unsupported });
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, []);

  return biometric.status === 'unavailable'
    ? { status: 'unavailable', reason: intl.formatMessage(biometric.reason) }
    : biometric;
}
