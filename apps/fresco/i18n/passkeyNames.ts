import { defineMessages, type IntlShape } from '@codaco/app-i18n/messages';

const messages = defineMessages({
  synced: {
    id: 'fresco.passkeyName.synced',
    defaultMessage: 'Synced passkey',
    description:
      'Generic name for an unknown authenticator whose passkey is synchronized across devices. Vendor and stored friendly names remain unchanged.',
  },
  device: {
    id: 'fresco.passkeyName.device',
    defaultMessage: 'Security key',
    description:
      'Generic name for an unknown authenticator whose credential is bound to one device. Vendor and stored friendly names remain unchanged.',
  },
});

type PasskeyName = { friendlyName: string | null; deviceType: string };

export function formatPasskeyName(
  intl: IntlShape,
  passkey: PasskeyName,
): string {
  if (passkey.friendlyName !== null) return passkey.friendlyName;
  return intl.formatMessage(
    passkey.deviceType === 'multiDevice' ? messages.synced : messages.device,
  );
}

/** Only generated names carry an identity. Existing names remain literal data. */
export function getPasskeyActivityValues(passkey: PasskeyName) {
  if (passkey.friendlyName !== null) return { passkey: passkey.friendlyName };
  const passkeyDeviceType: 'multiDevice' | 'singleDevice' =
    passkey.deviceType === 'multiDevice' ? 'multiDevice' : 'singleDevice';
  return { passkey: '', passkeyDeviceType };
}
