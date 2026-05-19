import { useRef } from 'react';

import Field from '@codaco/fresco-ui/form/Field/Field';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import Form from '@codaco/fresco-ui/form/Form';
import type { FormSubmissionResult } from '@codaco/fresco-ui/form/store/types';
import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';

type PinUnlockFormProps = {
  onSubmit: (
    pin: string,
  ) => FormSubmissionResult | Promise<FormSubmissionResult>;
  submitLabel?: string;
};

export default function PinUnlockForm({
  onSubmit,
  submitLabel = 'Unlock',
}: PinUnlockFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Form
      ref={formRef}
      onSubmit={(values) => {
        const pin = typeof values.pin === 'string' ? values.pin : '';
        return onSubmit(pin);
      }}
    >
      <Field
        component={SegmentedCodeField}
        name="pin"
        label="PIN"
        segments={8}
        characterSet="numeric"
        required
        minLength={8}
        maxLength={8}
        autoComplete="one-time-code"
        onComplete={() => formRef.current?.requestSubmit()}
      />
      <SubmitButton submittingText="Unlocking…">{submitLabel}</SubmitButton>
    </Form>
  );
}
