import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';

const messages = defineMessages({
  passphrase: {
    id: 'interviewer.passwordUnlockField.passphrase',
    defaultMessage: 'Passphrase',
    description:
      'Field label for entering the device passphrase in the unlock dialog.',
  },
  enterPassphrase: {
    id: 'interviewer.passwordUnlockField.enterPassphrase',
    defaultMessage: 'Enter passphrase',
    description:
      'Placeholder text inside the passphrase field in the unlock dialog.',
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
