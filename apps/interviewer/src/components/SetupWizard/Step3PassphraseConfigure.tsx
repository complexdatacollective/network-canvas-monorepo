import { type ReactNode, createElement, useEffect, useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { useWizard } from '@codaco/fresco-ui/dialogs/useWizard';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import { getPasswordStrength } from '@codaco/fresco-ui/form/fields/getPasswordStrength';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import * as authApi from '~/lib/auth/api';

import NoRecoveryNotice from './NoRecoveryNotice';

const messages = defineMessages({
  passphraseSetupFailed: {
    id: 'interviewer.step3PassphraseConfigure.passphraseSetupFailed',
    defaultMessage: 'Passphrase setup failed.',
    description:
      'User-facing message in Interviewer Step3Passphrase Configure.',
  },
  enterPassphrase: {
    id: 'interviewer.step3PassphraseConfigure.enterPassphrase',
    defaultMessage: 'Enter passphrase',
    description: 'The label label in Interviewer Step3Passphrase Configure.',
  },
  aPasswordOfAtLeast12Characters: {
    id: 'interviewer.step3PassphraseConfigure.aPasswordOfAtLeast12Characters',
    defaultMessage:
      'A password of at least 12 characters that combines uppercase, lowercase, numbers, and symbols.',
    description: 'The hint label in Interviewer Step3Passphrase Configure.',
  },
  confirmPassphrase: {
    id: 'interviewer.step3PassphraseConfigure.confirmPassphrase',
    defaultMessage: 'Confirm passphrase',
    description: 'The label label in Interviewer Step3Passphrase Configure.',
  },
  passphrasesDoNotMatch: {
    id: 'interviewer.step3PassphraseConfigure.passphrasesDoNotMatch',
    defaultMessage: 'Passphrases do not match.',
    description: 'Visible copy in Interviewer Step3Passphrase Configure.',
  },
  iUnderstandThereIsNoRecovery: {
    id: 'interviewer.step3PassphraseConfigure.iUnderstandThereIsNoRecovery',
    defaultMessage: 'I understand there is no recovery.',
    description: 'The label label in Interviewer Step3Passphrase Configure.',
  },
});

export default function Step3PassphraseConfigure() {
  const wizard = useWizard();
  const [phrase, setPhrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [affirmed, setAffirmed] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

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

      // Use authApi directly — context actions trigger refresh() which would
      // flip AuthGate to `unlocked` and reveal the home screen behind the
      // still-open wizard. SetupWizardDialog runs a single refresh after the
      // wizard closes so the Home transition happens at the right moment.
      const result = await authApi.enrolWithPassphrase(phrase);

      if (!result.ok) {
        setError(
          createElement(AppMessage, {
            message:
              result.localizedMessage?.descriptor ??
              messages.passphraseSetupFailed,
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
    <Step3PassphraseConfigureView
      phrase={phrase}
      confirmValue={confirm}
      affirmed={affirmed}
      error={error}
      onPhraseChange={setPhrase}
      onConfirmChange={setConfirm}
      onAffirmChange={setAffirmed}
    />
  );
}

export function Step3PassphraseConfigureView({
  phrase,
  confirmValue,
  affirmed,
  error,
  onPhraseChange,
  onConfirmChange,
  onAffirmChange,
}: {
  phrase: string;
  confirmValue: string;
  affirmed: boolean;
  error: ReactNode;
  onPhraseChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onAffirmChange: (value: boolean) => void;
}) {
  const intl = useAppIntl();
  return (
    <>
      <UnconnectedField
        name="passphrase"
        label={intl.formatMessage(messages.enterPassphrase)}
        hint={intl.formatMessage(messages.aPasswordOfAtLeast12Characters)}
        component={PasswordField}
        value={phrase}
        onChange={(v) => onPhraseChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter
        placeholder={intl.formatMessage(messages.enterPassphrase)}
      />
      <UnconnectedField
        name="passphrase-confirm"
        label={intl.formatMessage(messages.confirmPassphrase)}
        component={PasswordField}
        value={confirmValue}
        onChange={(v) => onConfirmChange(v ?? '')}
        suppressPasswordManager
        showStrengthMeter={false}
        placeholder={intl.formatMessage(messages.confirmPassphrase)}
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
      <NoRecoveryNotice method="passphrase" />
      <UnconnectedField
        name="passphrase-affirmation"
        label={intl.formatMessage(messages.iUnderstandThereIsNoRecovery)}
        component={Checkbox}
        value={affirmed}
        onChange={(v) => onAffirmChange(v ?? false)}
      />
    </>
  );
}
