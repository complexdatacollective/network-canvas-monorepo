import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

type PinUnlockFormProps = {
  onSubmit: (value: string) => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
  disabled?: boolean;
};

export default function PinUnlockForm({
  onSubmit,
  submitLabel = 'Unlock',
  disabled,
}: PinUnlockFormProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    const result = await onSubmit(pin);
    setSubmitting(false);
    if (result.ok) {
      setPin('');
    } else {
      setError(result.message ?? 'Incorrect PIN.');
      setPin('');
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4"
    >
      <SegmentedCodeField
        name="pin"
        aria-label="PIN"
        segments={8}
        characterSet="numeric"
        value={pin}
        onChange={(v) => setPin(v ?? '')}
        onComplete={() => void submit()}
        disabled={disabled ?? submitting}
        autoComplete="one-time-code"
      />
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <Button
        type="submit"
        color="primary"
        disabled={(disabled ?? submitting) || pin.length !== 8}
      >
        {submitting ? 'Unlocking…' : submitLabel}
      </Button>
    </form>
  );
}
