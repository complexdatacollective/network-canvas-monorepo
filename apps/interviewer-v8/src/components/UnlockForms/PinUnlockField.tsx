import Field from '@codaco/fresco-ui/form/Field/Field';
import type { FieldProps } from '@codaco/fresco-ui/form/Field/types';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';

type PinUnlockFieldProps = Partial<
  Omit<FieldProps<typeof SegmentedCodeField>, 'component' | 'onComplete'>
> & {
  onComplete?: () => void;
};

export default function PinUnlockField({
  onComplete,
  ...rest
}: PinUnlockFieldProps) {
  return (
    <Field
      name="pin"
      label="PIN"
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
