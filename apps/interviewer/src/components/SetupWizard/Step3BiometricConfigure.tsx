import { type ReactNode, createElement, useEffect, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import { getPasswordStrength } from '@codaco/fresco-ui/form/fields/getPasswordStrength';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';

const messages = defineMessages({
  biometricSetupFailed: {
    id: 'interviewer.step3BiometricConfigure.biometricSetupFailed',
    defaultMessage: 'Biometric setup failed.',
    description: 'User-facing message in Interviewer Step3Biometric Configure.',
  },
  biometricUnlockUsesYourDeviceSFace: {
    id: 'interviewer.step3BiometricConfigure.biometricUnlockUsesYourDeviceSFace',
    defaultMessage:
      "Biometric unlock uses your device's Face ID, Touch ID, or Windows Hello. When you continue, you'll be prompted to register it.",
    description: 'Visible copy in Interviewer Step3Biometric Configure.',
  },
  setARecoveryPassphrase: {
    id: 'interviewer.step3BiometricConfigure.setARecoveryPassphrase',
    defaultMessage: 'Set a recovery passphrase',
    description: 'Visible copy in Interviewer Step3Biometric Configure.',
  },
  ifYourBiometricEverBecomesUnavailableYou: {
    id: 'interviewer.step3BiometricConfigure.ifYourBiometricEverBecomesUnavailableYou',
    defaultMessage:
      'If your biometric ever becomes unavailable — you reset Face ID, replace the device, or remove the credential — this passphrase is the only way to unlock your data. Store it somewhere safe.',
    description: 'Visible copy in Interviewer Step3Biometric Configure.',
  },
  recoveryPassphrase: {
    id: 'interviewer.step3BiometricConfigure.recoveryPassphrase',
    defaultMessage: 'Recovery passphrase',
    description: 'The label label in Interviewer Step3Biometric Configure.',
  },
  atLeast12CharactersCombiningUppercaseLowercase: {
    id: 'interviewer.step3BiometricConfigure.atLeast12CharactersCombiningUppercaseLowercase',
    defaultMessage:
      'At least 12 characters combining uppercase, lowercase, numbers, and symbols.',
    description: 'The hint label in Interviewer Step3Biometric Configure.',
  },
  enterRecoveryPassphrase: {
    id: 'interviewer.step3BiometricConfigure.enterRecoveryPassphrase',
    defaultMessage: 'Enter recovery passphrase',
    description:
      'The placeholder label in Interviewer Step3Biometric Configure.',
  },
  confirmRecoveryPassphrase: {
    id: 'interviewer.step3BiometricConfigure.confirmRecoveryPassphrase',
    defaultMessage: 'Confirm recovery passphrase',
    description: 'The label label in Interviewer Step3Biometric Configure.',
  },
  passphrasesDoNotMatch: {
    id: 'interviewer.step3BiometricConfigure.passphrasesDoNotMatch',
    defaultMessage: 'Passphrases do not match.',
    description: 'Visible copy in Interviewer Step3Biometric Configure.',
  },
});

export default function Step3BiometricConfigure() {
  const wizard = useWizard();
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ReactNode>(null);

  const strength = getPasswordStrength(phrase);
  const isValid =
    phrase.length >= 12 && strength.score >= 3 && phrase === confirm;

  useEffect(() => {
    wizard.setNextEnabled(isValid);
  }, [isValid, wizard]);

  useEffect(() => {
    wizard.setBeforeNext(async () => {
      setError(null);

      const status = await authApi.status();
      if (status.configured && status.mode !== 'none') {
        await authApi.revoke();
      }

      // Enrol via authApi directly — a context action would refresh() and flip
      // AuthGate to `unlocked`, revealing Home behind the still-open wizard.
      // SetupWizardDialog runs one refresh after the wizard closes.
      const result = await authApi.enrolWithBiometric(phrase);
      if (!result.ok) {
        setError(
          createElement(AppMessage, {
            message:
              result.localizedMessage?.descriptor ??
              messages.biometricSetupFailed,
            values: result.localizedMessage?.values,
          }),
        );
        return false;
      }

      wizard.setStepData({ enrolmentCommitted: true });
      return true;
    });
  }, [wizard, phrase]);

  return (
    <Step3BiometricConfigureView
      phrase={phrase}
      confirmValue={confirm}
      error={error}
      onPhraseChange={setPhrase}
      onConfirmChange={setConfirm}
    />
  );
}

export function Step3BiometricConfigureView({
  phrase,
  confirmValue,
  error,
  onPhraseChange,
  onConfirmChange,
}: {
  phrase: string;
  confirmValue: string;
  error: ReactNode;
  onPhraseChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}) {
  const intl = useAppIntl();
  return (
    <>
      <Paragraph>
        {intl.formatMessage(messages.biometricUnlockUsesYourDeviceSFace)}
      </Paragraph>
      <Alert variant="info">
        <AlertTitle>
          {intl.formatMessage(messages.setARecoveryPassphrase)}
        </AlertTitle>
        <AlertDescription>
          {intl.formatMessage(
            messages.ifYourBiometricEverBecomesUnavailableYou,
          )}
        </AlertDescription>
      </Alert>
      <UnconnectedField
        name="recovery-passphrase"
        label={intl.formatMessage(messages.recoveryPassphrase)}
        hint={intl.formatMessage(
          messages.atLeast12CharactersCombiningUppercaseLowercase,
        )}
        component={PasswordField}
        value={phrase}
        onChange={(v) => onPhraseChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter
        placeholder={intl.formatMessage(messages.enterRecoveryPassphrase)}
      />
      <UnconnectedField
        name="recovery-passphrase-confirm"
        label={intl.formatMessage(messages.confirmRecoveryPassphrase)}
        component={PasswordField}
        value={confirmValue}
        onChange={(v) => onConfirmChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        placeholder={intl.formatMessage(messages.confirmRecoveryPassphrase)}
      />
      {confirmValue.length > 0 && phrase !== confirmValue && (
        <Paragraph margin="none" className="text-destructive text-sm">
          {intl.formatMessage(messages.passphrasesDoNotMatch)}
        </Paragraph>
      )}
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
    </>
  );
}
