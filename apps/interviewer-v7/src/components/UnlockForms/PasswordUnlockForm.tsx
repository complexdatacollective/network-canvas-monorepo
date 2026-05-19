import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

type PasswordUnlockFormProps = {
  onSubmit: (value: string) => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
  disabled?: boolean;
};

export default function PasswordUnlockForm({
  onSubmit,
  submitLabel = 'Unlock',
  disabled,
}: PasswordUnlockFormProps) {
  const [phrase, setPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await onSubmit(phrase);
    setSubmitting(false);
    if (result.ok) {
      setPhrase('');
    } else {
      setError(result.message ?? 'Incorrect passphrase.');
      setPhrase('');
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-4"
    >
      <PasswordField
        value={phrase}
        onChange={(v) => setPhrase(v ?? '')}
        disabled={disabled ?? submitting}
        placeholder="Enter passphrase"
        autoComplete="current-password"
        showStrengthMeter={false}
        aria-label="Passphrase"
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
        disabled={(disabled ?? submitting) || phrase.length === 0}
      >
        {submitting ? 'Unlocking…' : submitLabel}
      </Button>
    </form>
  );
}
