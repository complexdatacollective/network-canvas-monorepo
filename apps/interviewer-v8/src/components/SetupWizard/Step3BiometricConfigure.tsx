import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';

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

      // Web target: biometric enrolment is not available yet (Phase E adds
      // WebAuthn-PRF). Step2MethodPicker already disables this option; if this
      // step is reached, surface the unavailable message rather than branching.
      const result = await authApi.enrol();

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
