import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';
import { isCapacitor } from '~/lib/platform/platform';

import NoRecoveryNotice from './NoRecoveryNotice';

export default function Step3BiometricConfigure() {
  const wizard = useWizard();
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

      // Use authApi directly — context actions trigger refresh() which would
      // flip AuthGate to `unlocked` and reveal the home screen behind the
      // still-open wizard. SetupWizardDialog runs a single refresh after the
      // wizard closes so the Home transition happens at the right moment.
      const result = isCapacitor
        ? await authApi.enrolWithBiometricNative()
        : await authApi.enrol();

      if (!result.ok) {
        setError(result.message ?? 'Biometric enrolment failed.');
        return false;
      }

      wizard.setStepData({ enrolmentCommitted: true });
      return true;
    });
  }, [wizard]);

  return (
    <>
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
      <UnconnectedField
        name="biometric-affirmation"
        label="I understand there is no recovery."
        component={Checkbox}
        value={affirmed}
        onChange={(v) => setAffirmed(v ?? false)}
      />
    </>
  );
}
