import { useEffect, useState } from 'react';

import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
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
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Enter PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          autoComplete="off"
          value={pin}
          onChange={(e) =>
            setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
          }
          aria-label="Enter PIN"
          className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-center text-2xl tracking-[0.5em]"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Confirm PIN</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          autoComplete="off"
          value={confirm}
          onChange={(e) =>
            setConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))
          }
          aria-label="Confirm PIN"
          className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-center text-2xl tracking-[0.5em]"
        />
      </div>
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
