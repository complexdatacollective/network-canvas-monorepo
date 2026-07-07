import { useEffect, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import { getPasswordStrength } from '@codaco/fresco-ui/form/fields/getPasswordStrength';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';

export default function Step3BiometricConfigure() {
  const wizard = useWizard();
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

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
        setError(result.message ?? 'Biometric setup failed.');
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
  error: string | null;
  onPhraseChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
}) {
  return (
    <>
      <Paragraph>
        Biometric unlock uses your device's Face ID, Touch ID, or Windows Hello.
        When you click Next you'll be prompted to register it.
      </Paragraph>
      <Alert variant="info">
        <AlertTitle>Set a recovery passphrase</AlertTitle>
        <AlertDescription>
          If your biometric ever becomes unavailable — you reset Face ID,
          replace the device, or remove the credential — this passphrase is the
          only way to unlock your data. Store it somewhere safe.
        </AlertDescription>
      </Alert>
      <UnconnectedField
        name="recovery-passphrase"
        label="Recovery passphrase"
        hint="At least 12 characters combining uppercase, lowercase, numbers, and symbols."
        component={PasswordField}
        value={phrase}
        onChange={(v) => onPhraseChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter
        placeholder="Enter recovery passphrase"
      />
      <UnconnectedField
        name="recovery-passphrase-confirm"
        label="Confirm recovery passphrase"
        component={PasswordField}
        value={confirmValue}
        onChange={(v) => onConfirmChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        placeholder="Confirm recovery passphrase"
      />
      {confirmValue.length > 0 && phrase !== confirmValue && (
        <Paragraph margin="none" className="text-destructive text-sm">
          Passphrases do not match.
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
