import { useEffect, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

export function LockScreen() {
  const { mode, unlockWithAuthenticator, unlockWithPin } = useAuth();
  const toast = useToast();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleUnlockPasskey = async () => {
    setErrorMessage(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await unlockWithAuthenticator(controller.signal);
      if (result.ok) return;
      const message = result.message ?? '';
      if (/NotAllowedError/i.test(message)) {
        toast.add({ title: 'Unlock cancelled', variant: 'default' });
        return;
      }
      setErrorMessage(message || 'Could not unlock. Please try again.');
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const handleUnlockPin = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const result = await unlockWithPin(pin);
      if (result.ok) {
        setPin('');
        return;
      }
      setErrorMessage(result.message ?? 'Incorrect PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Surface level={1} spacing="lg" maxWidth="sm">
        <Heading level="h1">Device locked</Heading>
        <Paragraph intent="lead">
          {mode === 'pin'
            ? 'Enter your PIN to unlock this device.'
            : 'Authenticate to unlock this device and resume your work.'}
        </Paragraph>

        {errorMessage && (
          <div
            className="bg-destructive text-destructive-contrast mb-4 rounded p-4"
            role="alert"
          >
            <Paragraph margin="none">{errorMessage}</Paragraph>
          </div>
        )}

        {mode === 'pin' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleUnlockPin();
            }}
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
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
              }
              disabled={busy}
              aria-label="PIN"
              className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-center text-2xl tracking-[0.5em]"
            />
            <Button
              type="submit"
              color="primary"
              disabled={busy || pin.length !== 8}
            >
              {busy ? 'Unlocking…' : 'Unlock'}
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            color="primary"
            onClick={handleUnlockPasskey}
            disabled={busy}
          >
            {busy ? 'Waiting for authenticator…' : 'Unlock with authenticator'}
          </Button>
        )}
      </Surface>
    </div>
  );
}
