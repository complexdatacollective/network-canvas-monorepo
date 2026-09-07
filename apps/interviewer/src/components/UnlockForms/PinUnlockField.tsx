import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldProps } from '@codaco/fresco-ui/form/Field/types';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';

const messages = defineMessages({
  pIN: {
    id: 'interviewer.pinUnlockField.pIN',
    defaultMessage: 'PIN',
    description: 'The label label in Interviewer Pin Unlock Field.',
  },
});

type PinUnlockFieldProps = Partial<
  Omit<FieldProps<typeof SegmentedCodeField>, 'component' | 'onComplete'>
> & {
  onComplete?: () => void;
};

export default function PinUnlockField({
  onComplete,
  ...rest
}: PinUnlockFieldProps) {
  const intl = useAppIntl();
  return (
    <Field
      name="pin"
      label={intl.formatMessage(messages.pIN)}
      segments={8}
      characterSet="numeric"
      sensitive
      required
      minLength={8}
      maxLength={8}
      autoComplete="one-time-code"
      {...rest}
      component={SegmentedCodeField}
      onComplete={onComplete}
    />
  );
}
