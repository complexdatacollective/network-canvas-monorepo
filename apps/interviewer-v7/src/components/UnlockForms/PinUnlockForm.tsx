import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4"
    >
      <input
        type="password"
        inputMode="numeric"
        pattern="\d{8}"
        maxLength={8}
        autoComplete="current-password"
        ref={(node) => node?.focus()}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
        disabled={disabled ?? submitting}
        aria-label="PIN"
        className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-center text-2xl tracking-[0.5em]"
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
