import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';

const messages = defineMessages({
  passphrase: {
    id: 'interviewer.passwordUnlockField.passphrase',
    defaultMessage: 'Passphrase',
    description: 'The label label in Interviewer Password Unlock Field.',
  },
  enterPassphrase: {
    id: 'interviewer.passwordUnlockField.enterPassphrase',
    defaultMessage: 'Enter passphrase',
    description: 'The placeholder label in Interviewer Password Unlock Field.',
  },
});

export default function PasswordUnlockField({
  autoFocus,
}: {
  autoFocus?: boolean;
}) {
  const intl = useAppIntl();
  return (
    <Field
      component={PasswordField}
      name="passphrase"
      label={intl.formatMessage(messages.passphrase)}
      placeholder={intl.formatMessage(messages.enterPassphrase)}
      suppressPasswordManager
      showStrengthMeter={false}
      required
      autoFocus={autoFocus}
      data-testid="passphrase-input"
    />
  );
}
