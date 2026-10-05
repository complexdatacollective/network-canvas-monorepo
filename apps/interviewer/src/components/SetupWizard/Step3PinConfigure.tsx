import { type ReactNode, createElement, useEffect, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import Field from '@codaco/fresco-ui/form/Field/Field';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import { useFormValue } from '@codaco/fresco-ui/form/hooks/useFormValue';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';

import NoRecoveryNotice from './NoRecoveryNotice';

const messages = defineMessages({
  pINSetupFailed: {
    id: 'interviewer.step3PinConfigure.pINSetupFailed',
    defaultMessage: 'PIN setup failed.',
    description: 'User-facing message in Interviewer Step3Pin Configure.',
  },
  enterPIN: {
    id: 'interviewer.step3PinConfigure.enterPIN',
    defaultMessage: 'Enter PIN',
    description: 'The label label in Interviewer Step3Pin Configure.',
  },
  an8DigitNumericPIN: {
    id: 'interviewer.step3PinConfigure.an8DigitNumericPIN',
    defaultMessage: 'An 8-digit numeric PIN.',
    description: 'The hint label in Interviewer Step3Pin Configure.',
  },
  confirmPIN: {
    id: 'interviewer.step3PinConfigure.confirmPIN',
    defaultMessage: 'Confirm PIN',
    description: 'The label label in Interviewer Step3Pin Configure.',
  },
  iUnderstandThereIsNoRecovery: {
    id: 'interviewer.step3PinConfigure.iUnderstandThereIsNoRecovery',
    defaultMessage: 'I understand there is no recovery',
    description: 'The label label in Interviewer Step3Pin Configure.',
  },
});

export default function Step3PinConfigure() {
  const wizard = useWizard();
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
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
        setError(
          createElement(AppMessage, {
            message:
              result.localizedMessage?.descriptor ?? messages.pINSetupFailed,
            values: result.localizedMessage?.values,
          }),
        );
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
  error: ReactNode;
  affirmed: boolean;
  onAffirmChange: (value: boolean) => void;
}) {
  const intl = useAppIntl();
  return (
    <>
      <Field
        component={SegmentedCodeField}
        name="pin"
        label={intl.formatMessage(messages.enterPIN)}
        hint={intl.formatMessage(messages.an8DigitNumericPIN)}
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
        label={intl.formatMessage(messages.confirmPIN)}
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
        label={intl.formatMessage(messages.iUnderstandThereIsNoRecovery)}
        component={Checkbox}
        value={affirmed}
        onChange={(v) => onAffirmChange(v ?? false)}
      />
    </>
  );
}
