import Field from '@codaco/fresco-ui/form/Field/Field';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';

type PinUnlockFieldProps = {
  onComplete?: () => void;
};

export default function PinUnlockField({ onComplete }: PinUnlockFieldProps) {
  return (
    <Field
      component={SegmentedCodeField}
      name="pin"
      label="PIN"
      segments={8}
      characterSet="numeric"
      sensitive
      required
      minLength={8}
      maxLength={8}
      autoComplete="one-time-code"
      onComplete={onComplete}
    />
  );
}
