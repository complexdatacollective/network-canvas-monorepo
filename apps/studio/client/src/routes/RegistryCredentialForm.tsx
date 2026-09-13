import type { ComponentProps } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { FormWithoutProvider } from '@codaco/fresco-ui/form/Form';
import useFormStore from '@codaco/fresco-ui/form/hooks/useFormStore';
import FormStoreProvider from '@codaco/fresco-ui/form/store/formStoreProvider';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

type Props = {
  label: string;
  submitLabel: string;
  disabled?: boolean;
  onSubmit: (
    credential: string,
  ) => ReturnType<ComponentProps<typeof FormWithoutProvider>['onSubmit']>;
};

function CredentialForm({ label, submitLabel, disabled, onSubmit }: Props) {
  const resetField = useFormStore((state) => state.resetField);
  const submitting = useFormStore((state) => state.isSubmitting);
  return (
    <FormWithoutProvider
      onSubmit={async ({ credential }) => {
        if (disabled || typeof credential !== 'string')
          return { success: false };
        const result = await onSubmit(credential);
        if (result.success) resetField('credential');
        return result;
      }}
    >
      <Field
        name="credential"
        label={label}
        component={InputField}
        type="password"
        autoComplete="off"
        disabled={disabled}
        required
      />
      <SubmitButton disabled={disabled || submitting}>
        {submitLabel}
      </SubmitButton>
    </FormWithoutProvider>
  );
}

/** Request credentials are cleared after success without remounting the focused form. */
export default function RegistryCredentialForm(props: Props) {
  return (
    <FormStoreProvider>
      <CredentialForm {...props} />
    </FormStoreProvider>
  );
}
