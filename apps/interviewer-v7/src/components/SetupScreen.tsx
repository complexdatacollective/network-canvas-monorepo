import { useEffect, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

export function SetupScreen() {
  const { enrolAuthenticator, authenticatorSupported } = useAuth();
  const toast = useToast();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleEnrol = async () => {
    setErrorMessage(null);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await enrolAuthenticator(controller.signal);
      if (result.ok) return;
      const message = result.message ?? '';
      if (/NotAllowedError/i.test(message)) {
        toast.add({ title: 'Setup cancelled', variant: 'default' });
        return;
      }
      if (/PRF/i.test(message)) {
        setErrorMessage(
          'Your platform authenticator does not support the PRF extension. Use a different authenticator or device.',
        );
        return;
      }
      setErrorMessage(
        message || 'Could not enrol the authenticator. Please try again.',
      );
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-6 py-12">
      <Surface level={1} spacing="lg" maxWidth="sm">
        <Heading level="h1">Secure this device</Heading>
        <Paragraph intent="lead">
          This device will be secured with your platform authenticator. There is
          no recovery — losing the authenticator means losing the data on this
          device.
        </Paragraph>

        {!authenticatorSupported && (
          <div className="bg-destructive text-destructive-contrast mb-4 rounded p-4">
            <Paragraph margin="none">
              No platform authenticator is available on this device. Enrolment
              requires a built-in platform authenticator (Touch ID, Face ID,
              Windows Hello, or equivalent).
            </Paragraph>
          </div>
        )}

        {errorMessage && (
          <div
            className="bg-destructive text-destructive-contrast mb-4 rounded p-4"
            role="alert"
          >
            <Paragraph margin="none">{errorMessage}</Paragraph>
          </div>
        )}

        <div className="my-6 flex items-start gap-3">
          <Checkbox
            id="setup-acknowledge"
            value={acknowledged}
            onChange={(next) => setAcknowledged(next ?? false)}
            disabled={busy}
          />
          <label htmlFor="setup-acknowledge" className="cursor-pointer">
            I understand there is no recovery.
          </label>
        </div>

        <Button
          type="button"
          color="primary"
          onClick={handleEnrol}
          disabled={!acknowledged || busy || !authenticatorSupported}
        >
          {busy ? 'Enrolling…' : 'Enrol authenticator'}
        </Button>
      </Surface>
    </div>
  );
}
