import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';

export default function PasswordUnlockField({
  autoFocus,
}: {
  autoFocus?: boolean;
}) {
  return (
    <Field
      component={PasswordField}
      name="passphrase"
      label="Passphrase"
      placeholder="Enter passphrase"
      suppressPasswordManager
      showStrengthMeter={false}
      required
      autoFocus={autoFocus}
    />
  );
}
