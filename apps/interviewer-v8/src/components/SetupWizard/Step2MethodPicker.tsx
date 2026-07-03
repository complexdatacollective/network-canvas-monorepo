import { useEffect } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import { useBiometric } from '~/lib/auth/useBiometric';
import {
  hasPasskeyWindowLimitation,
  isMacChromium,
} from '~/lib/pwa/passkeyWindowLimitation';

import type { WizardSelectedMethod } from '../SetupWizardDialog';

const WIZARD_METHODS: WizardSelectedMethod[] = [
  'biometric',
  'pin',
  'passphrase',
  'none',
];

function isWizardSelectedMethod(value: unknown): value is WizardSelectedMethod {
  return typeof value === 'string' && WIZARD_METHODS.some((m) => m === value);
}

export default function Step2MethodPicker() {
  const { data, setStepData, setNextEnabled } = useWizard();
  const { confirm } = useDialog();
  const biometric = useBiometric();

  const rawMethod = data.selectedMethod;
  const selectedMethod = isWizardSelectedMethod(rawMethod) ? rawMethod : null;

  useEffect(() => {
    setNextEnabled(selectedMethod !== null);
  }, [selectedMethod, setNextEnabled]);

  const biometricDisabled =
    biometric.status === 'checking' || biometric.status === 'unavailable';

  // In a macOS Chromium browser tab, biometric enrolment works (Apple
  // Passwords), but the installed app cannot reach that passkey later
  // (crbug.com/364926914) — say so before the researcher commits to it.
  const macInstallCaveat =
    isMacChromium() && !hasPasskeyWindowLimitation()
      ? ' Note: on macOS, Chrome cannot use biometrics from the installed app — there you would unlock with your recovery passphrase.'
      : '';

  const biometricDescription =
    biometric.status === 'unavailable'
      ? biometric.reason
      : `Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device.${macInstallCaveat}`;

  return (
    <Step2MethodPickerView
      value={selectedMethod}
      onChange={(value) => {
        if (value === 'none') {
          void confirm({
            title: 'Continue without security?',
            description:
              'Your data will not be protected by an app lock or encryption managed by this app. Anyone with access to this device may be able to view collected data.',
            confirmLabel: 'Continue without security',
            intent: 'warning',
            onConfirm: () => {
              setStepData({ selectedMethod: 'none' });
            },
          });
          return;
        }
        setStepData({ selectedMethod: value });
      }}
      biometricDisabled={biometricDisabled}
      biometricDescription={biometricDescription}
    />
  );
}

export function Step2MethodPickerView({
  value,
  onChange,
  biometricDisabled,
  biometricDescription,
}: {
  value: WizardSelectedMethod | null;
  onChange: (value: WizardSelectedMethod) => void;
  biometricDisabled: boolean;
  biometricDescription: string;
}) {
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
    { type: 'spacer' as const },
    {
      value: 'none' as const,
      label: 'No security (not recommended)',
      description:
        'Skip app security. Your data will not be protected by the app.',
    },
  ];
  return (
    <RichSelectGroupField
      options={options}
      value={value ?? undefined}
      onChange={(v) => {
        if (isWizardSelectedMethod(v)) onChange(v);
      }}
      orientation="vertical"
      size="md"
    />
  );
}
