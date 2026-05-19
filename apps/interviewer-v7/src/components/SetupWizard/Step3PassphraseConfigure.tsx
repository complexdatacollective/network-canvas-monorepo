import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import { getPasswordStrength } from '@codaco/fresco-ui/form/fields/getPasswordStrength';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

export default function Step3PassphraseConfigure() {
  const wizard = useWizard();
  const { enrolWithPassphrase } = useAuth();
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(phrase);
  const isValid =
    phrase.length >= 12 &&
    strength.score >= 3 &&
    phrase === confirm &&
    affirmed;

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

      const result = await enrolWithPassphrase(phrase);

      if (!result.ok) {
        setError(result.message ?? 'Passphrase setup failed.');
        return false;
      }

      wizard.setStepData({ enrolmentCommitted: true });
      return true;
    });
  }, [wizard, enrolWithPassphrase, phrase]);

  return (
    <div className="flex flex-col gap-4">
      <UnconnectedField
        name="passphrase"
        label="Enter passphrase"
        hint="A password of at least 12 characters that combines uppercase, lowercase, numbers, and symbols."
        component={PasswordField}
        value={phrase}
        onChange={(v) => setPhrase(v ?? '')}
        autoComplete="off"
        showStrengthMeter={true}
        placeholder="Enter passphrase"
      />
      <UnconnectedField
        name="passphrase-confirm"
        label="Confirm passphrase"
        component={PasswordField}
        value={confirm}
        onChange={(v) => setConfirm(v ?? '')}
        autoComplete="off"
        showStrengthMeter={false}
        placeholder="Confirm passphrase"
      />
      {confirm.length > 0 && phrase !== confirm && (
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
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox value={affirmed} onChange={(v) => setAffirmed(v ?? false)} />
        <span className="text-sm leading-snug">
          I understand there is no recovery.
        </span>
      </label>
    </div>
  );
}
