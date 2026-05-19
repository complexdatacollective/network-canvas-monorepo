import { useEffect, useRef, useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Checkbox from '@codaco/fresco-ui/form/fields/Checkbox';
import Surface from '@codaco/fresco-ui/layout/Surface';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

const PIN_PATTERN = /^\d{8}$/;

type Method = 'passkey' | 'pin' | 'none';

export function SetupScreen() {
  const {
    enrolAuthenticator,
    enrolWithPin,
    enrolWithoutLock,
    authenticatorSupported,
  } = useAuth();
  const toast = useToast();
  const [method, setMethod] = useState<Method>(
    authenticatorSupported ? 'passkey' : 'pin',
  );
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleEnrolPasskey = async () => {
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
          'Your platform authenticator does not support the PRF extension. Use a PIN instead, or try a different device.',
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

  const handleEnrolPin = async () => {
    setErrorMessage(null);
    if (!PIN_PATTERN.test(pin)) {
      setErrorMessage('PIN must be exactly 8 digits.');
      return;
    }
    if (pin !== pinConfirm) {
      setErrorMessage('The two PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await enrolWithPin(pin);
      if (result.ok) return;
      setErrorMessage(result.message ?? 'Could not set the PIN.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnrolNone = async () => {
    setErrorMessage(null);
    setBusy(true);
    try {
      const result = await enrolWithoutLock();
      if (result.ok) return;
      setErrorMessage(
        result.message ?? 'Could not finish setup without a lock.',
      );
    } finally {
      setBusy(false);
    }
  };

  const submitDisabled =
    !acknowledged ||
    busy ||
    (method === 'passkey'
      ? !authenticatorSupported
      : method === 'pin'
        ? !PIN_PATTERN.test(pin) || pin !== pinConfirm
        : false);

  const acknowledgeLabel =
    method === 'none'
      ? 'I understand that data on this device will not be encrypted at the app layer.'
      : 'I understand there is no recovery.';

  const onSubmit =
    method === 'passkey'
      ? handleEnrolPasskey
      : method === 'pin'
        ? handleEnrolPin
        : handleEnrolNone;

  const submitLabel = busy
    ? method === 'passkey'
      ? 'Enrolling…'
      : method === 'pin'
        ? 'Setting PIN…'
        : 'Finishing setup…'
    : method === 'passkey'
      ? 'Enrol authenticator'
      : method === 'pin'
        ? 'Set PIN'
        : 'Continue without a lock';

  return (
    <div className="bg-background flex min-h-dvh items-center justify-center px-6 py-12">
      <Surface level={1} spacing="lg" maxWidth="sm">
        <Heading level="h1">Secure this device</Heading>
        <Paragraph intent="lead">
          Choose how this device should be secured. A passkey or PIN protects
          your data with encryption; choosing no lock leaves data unencrypted at
          the app layer.
        </Paragraph>

        <fieldset className="my-6 flex flex-col gap-3" disabled={busy}>
          <legend className="sr-only">Choose a setup method</legend>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="setup-method"
              value="passkey"
              checked={method === 'passkey'}
              onChange={() => setMethod('passkey')}
              disabled={!authenticatorSupported}
            />
            <span className="flex flex-col">
              <span className="font-medium">Passkey</span>
              <span className="text-text/60 text-sm">
                Use Touch ID, Face ID, Windows Hello, or a hardware security
                key.
                {!authenticatorSupported && (
                  <em> Not available on this device.</em>
                )}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="setup-method"
              value="pin"
              checked={method === 'pin'}
              onChange={() => setMethod('pin')}
            />
            <span className="flex flex-col">
              <span className="font-medium">PIN</span>
              <span className="text-text/60 text-sm">
                Exactly 8 digits. Required when no platform authenticator is
                available.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              type="radio"
              name="setup-method"
              value="none"
              checked={method === 'none'}
              onChange={() => setMethod('none')}
            />
            <span className="flex flex-col">
              <span className="font-medium">No lock</span>
              <span className="text-text/60 text-sm">
                Skip device-level protection. Data is written to disk without
                app-layer encryption.
              </span>
            </span>
          </label>
        </fieldset>

        {method === 'pin' && (
          <div className="mb-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{8}"
                maxLength={8}
                autoComplete="new-password"
                value={pin}
                onChange={(e) =>
                  setPin(e.target.value.replace(/\D/g, '').slice(0, 8))
                }
                disabled={busy}
                className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-lg tracking-widest"
                aria-label="PIN"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Confirm PIN</span>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{8}"
                maxLength={8}
                autoComplete="new-password"
                value={pinConfirm}
                onChange={(e) =>
                  setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))
                }
                disabled={busy}
                className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-lg tracking-widest"
                aria-label="Confirm PIN"
              />
            </label>
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
            {acknowledgeLabel}
          </label>
        </div>

        <Button
          type="button"
          color="primary"
          onClick={onSubmit}
          disabled={submitDisabled}
        >
          {submitLabel}
        </Button>
      </Surface>
    </div>
  );
}
