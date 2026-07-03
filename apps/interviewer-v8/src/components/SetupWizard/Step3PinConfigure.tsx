import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Field from '@codaco/fresco-ui/form/Field/Field';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';

import NoRecoveryNotice from './NoRecoveryNotice';

export default function Step3PinConfigure() {
  const wizard = useWizard();
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pin } = useFormValue<readonly ['pin'], string>(['pin']);

  useEffect(() => {
    // The wizard runs validateForm() on Next click; that covers length and
    // sameAs mismatches. Here we only gate Next on the affirmation and on
    // having a value at all (so the button isn't enabled before any input).
    wizard.setNextEnabled(affirmed && Boolean(pin));
  }, [affirmed, pin, wizard]);

  useEffect(() => {
    wizard.setBeforeNext(async () => {
      setError(null);
      if (typeof pin !== 'string' || pin.length !== 8) return false;

      const status = await authApi.status();
      if (status.configured && status.mode !== 'none') {
        await authApi.revoke();
      }

      // Use authApi directly — context actions trigger refresh() which would
      // flip AuthGate to `unlocked` and reveal the home screen behind the
      // still-open wizard. SetupWizardDialog runs a single refresh after the
      // wizard closes so the Home transition happens at the right moment.
      const result = await authApi.enrolWithPin(pin);

      if (!result.ok) {
        setError(result.message ?? 'PIN setup failed.');
        return false;
      }

      wizard.setStepData({ enrolmentCommitted: true });
      return true;
    });
  }, [wizard, pin]);

  return (
    <Step3PinConfigureView
      error={error}
      affirmed={affirmed}
      onAffirmChange={setAffirmed}
    />
  );
}

export function Step3PinConfigureView({
  error,
  affirmed,
  onAffirmChange,
}: {
  error: string | null;
  affirmed: boolean;
  onAffirmChange: (value: boolean) => void;
}) {
  return (
    <>
      <Field
        component={SegmentedCodeField}
        name="pin"
        label="Enter PIN"
        hint="An 8-digit numeric PIN."
        segments={8}
        characterSet="numeric"
        sensitive
        required
        minLength={8}
        maxLength={8}
        validateOnChange
      />
      <Field
        component={SegmentedCodeField}
        name="pin-confirm"
        label="Confirm PIN"
        segments={8}
        characterSet="numeric"
        sensitive
        required
        minLength={8}
        maxLength={8}
        sameAs="pin"
        validateOnChange
      />
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <NoRecoveryNotice method="pin" />
      <UnconnectedField
        inline
        name="pin-affirmation"
        label="I understand there is no recovery"
        component={Checkbox}
        value={affirmed}
        onChange={(v) => onAffirmChange(v ?? false)}
      />
    </>
  );
}
