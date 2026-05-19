import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import { isAuthenticatorSupported } from '~/lib/auth/api';
import { isBiometricNativeAvailable } from '~/lib/auth/biometricNative';
import { isCapacitor } from '~/lib/platform/platform';

import type { WizardSelectedMethod } from '../SetupWizardDialog';

const WIZARD_METHODS: WizardSelectedMethod[] = [
  'biometric',
  'pin',
  'passphrase',
];

function isWizardSelectedMethod(value: unknown): value is WizardSelectedMethod {
  return typeof value === 'string' && WIZARD_METHODS.some((m) => m === value);
}

type BiometricState =
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string };

const UNAVAILABLE_REASON_TEXT: Record<
  'no-hardware' | 'not-enrolled' | 'no-device-passcode' | 'unknown',
  string
> = {
  'no-hardware': 'No biometric sensor available on this device',
  'not-enrolled': 'No biometric is enrolled on this device',
  'no-device-passcode': 'Set a device passcode first',
  'unknown': 'Biometric authentication is not available',
};

export default function Step2MethodPicker() {
  const { data, setStepData, setNextEnabled } = useWizard();
  const [biometric, setBiometric] = useState<BiometricState>({
    status: 'checking',
  });

  const rawMethod = data.selectedMethod;
  const selectedMethod = isWizardSelectedMethod(rawMethod) ? rawMethod : null;

  useEffect(() => {
    setNextEnabled(selectedMethod !== null);
  }, [selectedMethod, setNextEnabled]);

  useEffect(() => {
    async function checkBiometric() {
      if (isCapacitor) {
        const result = await isBiometricNativeAvailable();
        if (result.ok) {
          setBiometric({ status: 'available' });
        } else {
          setBiometric({
            status: 'unavailable',
            reason: UNAVAILABLE_REASON_TEXT[result.reason],
          });
        }
      } else {
        const supported = isAuthenticatorSupported();
        if (supported) {
          setBiometric({ status: 'available' });
        } else {
          setBiometric({
            status: 'unavailable',
            reason: UNAVAILABLE_REASON_TEXT['no-hardware'],
          });
        }
      }
    }

    void checkBiometric();
  }, []);

  const biometricDisabled =
    biometric.status === 'checking' || biometric.status === 'unavailable';

  const biometricDescription =
    biometric.status === 'unavailable'
      ? biometric.reason
      : 'Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device.';

  const options = [
    {
      value: 'biometric' as const,
      label: 'Biometric authentication',
      description: biometricDescription,
      disabled: biometricDisabled,
    },
    {
      value: 'pin' as const,
      label: 'PIN code',
      description: 'An 8-digit numeric PIN.',
      disabled: false,
    },
    {
      value: 'passphrase' as const,
      label: 'Passphrase',
      description: 'A password of at least 12 characters.',
      disabled: false,
    },
  ];

  return (
    <RichSelectGroupField
      options={options}
      value={selectedMethod ?? undefined}
      onChange={(value) => {
        if (isWizardSelectedMethod(value)) {
          setStepData({ selectedMethod: value });
        }
      }}
      orientation="vertical"
      size="md"
    />
  );
}
