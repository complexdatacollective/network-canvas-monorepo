import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';
import { useAuth } from '~/lib/auth/AuthContext';

export default function Step3PinConfigure() {
  const wizard = useWizard();
  const { enrolWithPin } = useAuth();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = /^\d{8}$/.test(pin) && pin === confirm && affirmed;

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

      const result = await enrolWithPin(pin);

      if (!result.ok) {
        setError(result.message ?? 'PIN setup failed.');
        return false;
      }

      wizard.setStepData({ enrolmentCommitted: true });
      return true;
    });
  }, [wizard, enrolWithPin, pin]);

  return (
    <div className="flex flex-col gap-4">
      <UnconnectedField
        name="pin"
        label="Enter PIN"
        hint="An 8-digit numeric PIN."
        component={SegmentedCodeField}
        segments={8}
        characterSet="numeric"
        value={pin}
        onChange={(v) => setPin(v ?? '')}
      />
      <UnconnectedField
        name="pin-confirm"
        label="Confirm PIN"
        component={SegmentedCodeField}
        segments={8}
        characterSet="numeric"
        value={confirm}
        onChange={(v) => setConfirm(v ?? '')}
      />
      {confirm.length > 0 && pin !== confirm && (
        <Paragraph margin="none" className="text-destructive text-sm">
          PINs do not match.
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
