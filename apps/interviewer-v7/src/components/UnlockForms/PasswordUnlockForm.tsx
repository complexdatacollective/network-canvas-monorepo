import Field from '@codaco/fresco-ui/form/Field/Field';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Form from '@codaco/fresco-ui/form/Form';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

type PasswordUnlockFormProps = {
  onSubmit: (
    passphrase: string,
  ) => FormSubmissionResult | Promise<FormSubmissionResult>;
  submitLabel?: string;
};

export default function PasswordUnlockForm({
  onSubmit,
  submitLabel = 'Unlock',
}: PasswordUnlockFormProps) {
  return (
    <Form
      onSubmit={(values) => {
        const phrase =
          typeof values.passphrase === 'string' ? values.passphrase : '';
        return onSubmit(phrase);
      }}
    >
      <Field
        component={PasswordField}
        name="passphrase"
        label="Passphrase"
        placeholder="Enter passphrase"
        autoComplete="current-password"
        showStrengthMeter={false}
        required
      />
      <SubmitButton submittingText="Unlocking…">{submitLabel}</SubmitButton>
    </Form>
  );
}
