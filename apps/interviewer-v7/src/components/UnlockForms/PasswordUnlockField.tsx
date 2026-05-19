import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';

export default function PasswordUnlockField() {
  return (
    <Field
      component={PasswordField}
      name="passphrase"
      label="Passphrase"
      placeholder="Enter passphrase"
      autoComplete="current-password"
      showStrengthMeter={false}
      required
    />
  );
}
