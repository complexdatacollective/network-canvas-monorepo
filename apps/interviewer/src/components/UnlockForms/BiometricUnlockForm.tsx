import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

type BiometricUnlockFormProps = {
  onSubmit: () => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
  disabled?: boolean;
};

export default function BiometricUnlockForm({
  onSubmit,
  submitLabel = 'Unlock with authenticator',
  disabled,
}: BiometricUnlockFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    setSubmitting(true);
    setError(null);
    const result = await onSubmit();
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message ?? 'Unlock failed');
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        color="primary"
        onClick={() => void handleClick()}
        disabled={disabled ?? submitting}
      >
        {submitting ? 'Waiting for authenticator…' : submitLabel}
      </Button>
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
    </div>
  );
}
