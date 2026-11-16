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
import { isWizardSelectedMethod } from './wizardData';

const messages = defineMessages({
  thisDeviceLockIsAlreadyProtectingStored: {
    id: 'interviewer.step2MethodPicker.thisDeviceLockIsAlreadyProtectingStored',
    defaultMessage:
      'This device lock is already protecting stored data. Finish setup before changing it from the Security settings.',
    description:
      'Note above the method choices when a lock was already set up in this wizard; the method cannot be changed here after data is protected. Settings refers to the Security settings.',
  },
  biometricAuthentication: {
    id: 'interviewer.step2MethodPicker.biometricAuthentication',
    defaultMessage: 'Biometric authentication',
    description:
      'Option label on the choose-method step: unlock with the device biometrics (Face ID, Touch ID, Windows Hello).',
  },
  pINCode: {
    id: 'interviewer.step2MethodPicker.pINCode',
    defaultMessage: 'PIN code',
    description:
      'Option label on the choose-method step: unlock with a numeric PIN code.',
  },
  an8DigitNumericPIN: {
    id: 'interviewer.step2MethodPicker.an8DigitNumericPIN',
    defaultMessage: 'An 8-digit numeric PIN.',
    description: 'Description under the PIN option on the choose-method step.',
  },
  passphrase: {
    id: 'interviewer.step2MethodPicker.passphrase',
    defaultMessage: 'Passphrase',
    description:
      'Option label on the choose-method step: unlock with a typed passphrase.',
  },
  aPasswordOfAtLeast12Characters: {
    id: 'interviewer.step2MethodPicker.aPasswordOfAtLeast12Characters',
    defaultMessage: 'A password of at least 12 characters.',
    description:
      'Description under the Passphrase option on the choose-method step, stating the minimum length.',
  },
  noSecurityNotRecommended: {
    id: 'interviewer.step2MethodPicker.noSecurityNotRecommended',
    defaultMessage: 'No security (not recommended)',
    description:
      'Option label on the choose-method step: use the app with no lock. The parenthesis warns against choosing it.',
  },
  skipAppSecurityYourDataWillNot: {
    id: 'interviewer.step2MethodPicker.skipAppSecurityYourDataWillNot',
    defaultMessage:
      'Skip app security. Your data will not be protected by the app.',
    description:
      'Description under the "No security" option on the choose-method step, warning that data will not be protected.',
  },
  continueWithoutSecurity: {
    id: 'interviewer.step2MethodPicker.continueWithoutSecurity',
    defaultMessage: 'Continue without security?',
    description:
      'Title of the confirmation dialog shown after choosing the no-security option; asks whether to proceed.',
  },
  yourDataWillNotBeProtectedBy: {
    id: 'interviewer.step2MethodPicker.yourDataWillNotBeProtectedBy',
    defaultMessage:
      'Your data will not be protected by an app lock or encryption managed by this app. Anyone with access to this device may be able to view collected data.',
    description:
      'Body of the no-security confirmation dialog; warns that data has no app lock or encryption so anyone with the device may view it.',
  },
  continueWithoutSecurity2: {
    id: 'interviewer.step2MethodPicker.continueWithoutSecurity2',
    defaultMessage: 'Continue without security',
    description:
      'Confirm button in the no-security dialog; accepts using the app without any lock.',
  },
  biometricDescription: {
    id: 'interviewer.step2MethodPicker.biometricDescription',
    defaultMessage:
      '{macInstalledLimitation, select, true {Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device. Note: on macOS, Chrome cannot use biometrics from the installed app — there you would unlock with your recovery passphrase.} other {Use Face ID, Touch ID, Windows Hello, or another biometric sensor on this device.}}',
    description:
      'Description under the Biometric option on the choose-method step. macInstalledLimitation is "true" when on macOS Chrome, where biometrics cannot be used from the installed app; otherwise "other" applies.',
  },
});

// The "no security" confirmation's localised nodes, built at module scope so
// the picker's change handler stays a plain callback rather than an element
// factory re-created on every render.
const noSecurityTitle = (
  <AppMessage message={messages.continueWithoutSecurity} />
);
const noSecurityDescription = (
  <AppMessage message={messages.yourDataWillNotBeProtectedBy} />
);
const noSecurityConfirmLabel = (
  <AppMessage message={messages.continueWithoutSecurity2} />
);

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
              title: noSecurityTitle,
              description: noSecurityDescription,
              confirmLabel: noSecurityConfirmLabel,
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
