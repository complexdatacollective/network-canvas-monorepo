import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';
import { isCapacitor } from '~/lib/platform/platform';

import NoRecoveryNotice from './NoRecoveryNotice';

export default function Step3BiometricConfigure() {
  const wizard = useWizard();
  const { enrolWithBiometricNative, enrolAuthenticator } = useAuth();
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    wizard.setNextEnabled(affirmed);
  }, [affirmed, wizard]);

  useEffect(() => {
    wizard.setBeforeNext(async () => {
      setError(null);

      const status = await authApi.status();
      if (status.configured && status.mode !== 'none') {
        await authApi.revoke();
      }

      const result = isCapacitor
        ? await enrolWithBiometricNative()
        : await enrolAuthenticator();

      if (!result.ok) {
        setError(result.message ?? 'Biometric enrolment failed.');
        return false;
      }

      wizard.setStepData({ enrolmentCommitted: true });
      return true;
    });
  }, [wizard, enrolWithBiometricNative, enrolAuthenticator]);

  return (
    <div className="flex flex-col gap-4">
      <Paragraph>
        You'll be prompted to use your device's biometric sensor when you click
        Next.
      </Paragraph>
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <NoRecoveryNotice method="biometric" />
      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox value={affirmed} onChange={(v) => setAffirmed(v ?? false)} />
        <span className="text-sm leading-snug">
          I understand there is no recovery.
        </span>
      </label>
    </div>
  );
}
