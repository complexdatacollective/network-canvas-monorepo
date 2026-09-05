import { useEffect } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useBiometric } from '~/lib/auth/useBiometric';
import {
  hasPasskeyWindowLimitation,
  isMacChromium,
} from '~/lib/pwa/passkeyWindowLimitation';

import type { WizardSelectedMethod } from '../SetupWizardDialog';

const messages = defineMessages({
  thisDeviceLockIsAlreadyProtectingStored: {
    id: 'interviewer.step2MethodPicker.thisDeviceLockIsAlreadyProtectingStored',
    defaultMessage:
      'This device lock is already protecting stored data. Finish setup before changing it from the Security settings.',
    description: 'Visible copy in Interviewer Step2Method Picker.',
  },
  biometricAuthentication: {
    id: 'interviewer.step2MethodPicker.biometricAuthentication',
    defaultMessage: 'Biometric authentication',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  pINCode: {
    id: 'interviewer.step2MethodPicker.pINCode',
    defaultMessage: 'PIN code',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  an8DigitNumericPIN: {
    id: 'interviewer.step2MethodPicker.an8DigitNumericPIN',
    defaultMessage: 'An 8-digit numeric PIN.',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  passphrase: {
    id: 'interviewer.step2MethodPicker.passphrase',
    defaultMessage: 'Passphrase',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  aPasswordOfAtLeast12Characters: {
    id: 'interviewer.step2MethodPicker.aPasswordOfAtLeast12Characters',
    defaultMessage: 'A password of at least 12 characters.',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  noSecurityNotRecommended: {
    id: 'interviewer.step2MethodPicker.noSecurityNotRecommended',
    defaultMessage: 'No security (not recommended)',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  skipAppSecurityYourDataWillNot: {
    id: 'interviewer.step2MethodPicker.skipAppSecurityYourDataWillNot',
    defaultMessage:
      'Skip app security. Your data will not be protected by the app.',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  continueWithoutSecurity: {
    id: 'interviewer.step2MethodPicker.continueWithoutSecurity',
    defaultMessage: 'Continue without security?',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  yourDataWillNotBeProtectedBy: {
    id: 'interviewer.step2MethodPicker.yourDataWillNotBeProtectedBy',
    defaultMessage:
      'Your data will not be protected by an app lock or encryption managed by this app. Anyone with access to this device may be able to view collected data.',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  continueWithoutSecurity2: {
    id: 'interviewer.step2MethodPicker.continueWithoutSecurity2',
    defaultMessage: 'Continue without security',
    description: 'User-facing message in Interviewer Step2Method Picker.',
  },
  biometricDescription: {
    id: 'interviewer.step2MethodPicker.biometricDescription',
    defaultMessage:
      '{macInstalledLimitation, select, true {Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device. Note: on macOS, Chrome cannot use biometrics from the installed app — there you would unlock with your recovery passphrase.} other {Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device.}}',
    description: 'Administration text in Interviewer Step2MethodPicker.',
  },
});

const WIZARD_METHODS: WizardSelectedMethod[] = [
  'biometric',
  'pin',
  'passphrase',
  'none',
];

function isWizardSelectedMethod(value: unknown): value is WizardSelectedMethod {
  return typeof value === 'string' && WIZARD_METHODS.some((m) => m === value);
}

export default function Step2MethodPicker({
  lockCommittedMethod = false,
}: {
  lockCommittedMethod?: boolean;
}) {
  const intl = useAppIntl();
  const { data, setStepData, setNextEnabled } = useWizard();
  const { confirm } = useDialog();
  const biometric = useBiometric();

  const rawMethod = data.selectedMethod;
  const selectedMethod = isWizardSelectedMethod(rawMethod) ? rawMethod : null;
  const methodLocked = lockCommittedMethod && data.enrolmentCommitted === true;

  useEffect(() => {
    setNextEnabled(selectedMethod !== null);
  }, [selectedMethod, setNextEnabled]);

  // Switching methods must not carry over a prior method's committed enrolment,
  // or Step3 would show it as "configured" while the vault holds the old mode.
  const commitMethod = (value: WizardSelectedMethod) => {
    if (value === selectedMethod) {
      setStepData({ selectedMethod: value });
      return;
    }
    setStepData({ selectedMethod: value, enrolmentCommitted: false });
  };

  const biometricDisabled =
    biometric.status === 'checking' || biometric.status === 'unavailable';

  // In a macOS Chromium browser tab, biometric enrolment works (Apple
  // Passwords), but the installed app cannot reach that passkey later
  // (crbug.com/364926914) — say so before the researcher commits to it.
  const biometricDescription =
    biometric.status === 'unavailable'
      ? biometric.reason
      : intl.formatMessage(messages.biometricDescription, {
          macInstalledLimitation: String(
            isMacChromium() && !hasPasskeyWindowLimitation(),
          ),
        });

  return (
    <>
      {methodLocked ? (
        <Paragraph intent="smallText" emphasis="muted">
          {intl.formatMessage(messages.thisDeviceLockIsAlreadyProtectingStored)}
        </Paragraph>
      ) : null}
      <Step2MethodPickerView
        value={selectedMethod}
        onChange={(value) => {
          if (methodLocked && value !== selectedMethod) return;
          if (value === 'none') {
            void confirm({
              title: <AppMessage message={messages.continueWithoutSecurity} />,
              description: (
                <AppMessage message={messages.yourDataWillNotBeProtectedBy} />
              ),
              confirmLabel: (
                <AppMessage message={messages.continueWithoutSecurity2} />
              ),
              intent: 'warning',
              onConfirm: () => {
                commitMethod('none');
              },
            });
            return;
          }
          commitMethod(value);
        }}
        biometricDisabled={biometricDisabled}
        biometricDescription={biometricDescription}
        lockedMethod={methodLocked ? selectedMethod : null}
      />
    </>
  );
}

export function Step2MethodPickerView({
  value,
  onChange,
  biometricDisabled,
  biometricDescription,
  lockedMethod = null,
}: {
  value: WizardSelectedMethod | null;
  onChange: (value: WizardSelectedMethod) => void;
  biometricDisabled: boolean;
  biometricDescription: string;
  lockedMethod?: WizardSelectedMethod | null;
}) {
  const intl = useAppIntl();
  const options = [
    {
      value: 'biometric' as const,
      label: intl.formatMessage(messages.biometricAuthentication),
      description: biometricDescription,
      disabled:
        biometricDisabled ||
        (lockedMethod !== null && lockedMethod !== 'biometric'),
    },
    {
      value: 'pin' as const,
      label: intl.formatMessage(messages.pINCode),
      description: intl.formatMessage(messages.an8DigitNumericPIN),
      disabled: lockedMethod !== null && lockedMethod !== 'pin',
    },
    {
      value: 'passphrase' as const,
      label: intl.formatMessage(messages.passphrase),
      description: intl.formatMessage(messages.aPasswordOfAtLeast12Characters),
      disabled: lockedMethod !== null && lockedMethod !== 'passphrase',
    },
    { type: 'spacer' as const },
    {
      value: 'none' as const,
      label: intl.formatMessage(messages.noSecurityNotRecommended),
      description: intl.formatMessage(messages.skipAppSecurityYourDataWillNot),
      disabled: lockedMethod !== null && lockedMethod !== 'none',
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
