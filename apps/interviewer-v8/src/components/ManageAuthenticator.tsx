import { KeyRound, ShieldOff } from 'lucide-react';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import { getPasswordStrength } from '@codaco/fresco-ui/form/fields/getPasswordStrength';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SettingsRow } from '~/components/SettingsRow';
import { useAuth } from '~/lib/auth/AuthContext';

const MODE_LABEL: Record<string, string> = {
  pin: 'PIN',
  passphrase: 'Passphrase',
  biometric: 'Biometric (with recovery passphrase)',
  none: 'No device lock',
};

const PIN_PATTERN = /^\d{8}$/;

function ChangePinForm({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [nextPinConfirm, setNextPinConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!PIN_PATTERN.test(nextPin)) {
      setError('Your new PIN must be exactly 8 digits.');
      return;
    }
    if (nextPin !== nextPinConfirm) {
      setError('The two new PINs do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await auth.reEnrolWithPin(currentPin, nextPin);
      if (result.ok) {
        toast.add({ title: 'PIN changed', variant: 'success' });
        onDone();
        return;
      }
      setError(result.message ?? 'We could not change your PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <UnconnectedField
        name="currentPin"
        label="Current PIN"
        component={PasswordField}
        value={currentPin}
        onChange={(next) => setCurrentPin(next ?? '')}
        autoComplete="current-password"
        showStrengthMeter={false}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPin"
        label="New PIN"
        component={SegmentedCodeField}
        segments={8}
        characterSet="numeric"
        sensitive
        minLength={8}
        maxLength={8}
        autoComplete="new-password"
        value={nextPin}
        onChange={(next) => setNextPin(next ?? '')}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPinConfirm"
        label="Confirm new PIN"
        component={SegmentedCodeField}
        segments={8}
        characterSet="numeric"
        sensitive
        minLength={8}
        maxLength={8}
        autoComplete="new-password"
        value={nextPinConfirm}
        onChange={(next) => setNextPinConfirm(next ?? '')}
        disabled={busy}
      />
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <div className="mt-4 mb-6 flex gap-2">
        <Button onClick={() => void handleSave()} disabled={busy}>
          {busy ? 'Saving…' : 'Save new PIN'}
        </Button>
        <Button color="secondary" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </>
  );
}

function ChangePassphraseForm({ onDone }: { onDone: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [currentPhrase, setCurrentPhrase] = useState('');
  const [nextPhrase, setNextPhrase] = useState('');
  const [nextPhraseConfirm, setNextPhraseConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getPasswordStrength(nextPhrase);
  const nextIsStrong = nextPhrase.length >= 12 && strength.score >= 3;

  const handleSave = async () => {
    setError(null);
    if (!nextIsStrong) {
      setError(
        'Your new passphrase must be at least 12 characters and combine uppercase, lowercase, numbers, and symbols.',
      );
      return;
    }
    if (nextPhrase !== nextPhraseConfirm) {
      setError('The two new passphrases do not match.');
      return;
    }
    setBusy(true);
    try {
      const result = await auth.reEnrolWithPassphrase(
        currentPhrase,
        nextPhrase,
      );
      if (result.ok) {
        toast.add({ title: 'Passphrase changed', variant: 'success' });
        onDone();
        return;
      }
      setError(result.message ?? 'We could not change your passphrase.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <UnconnectedField
        name="currentPassphrase"
        label="Current passphrase"
        component={PasswordField}
        value={currentPhrase}
        onChange={(next) => setCurrentPhrase(next ?? '')}
        autoComplete="current-password"
        showStrengthMeter={false}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPassphrase"
        label="New passphrase"
        hint="At least 12 characters, combining uppercase, lowercase, numbers, and symbols."
        component={PasswordField}
        value={nextPhrase}
        onChange={(next) => setNextPhrase(next ?? '')}
        autoComplete="new-password"
        showStrengthMeter={true}
        disabled={busy}
      />
      <UnconnectedField
        name="nextPassphraseConfirm"
        label="Confirm new passphrase"
        component={PasswordField}
        value={nextPhraseConfirm}
        onChange={(next) => setNextPhraseConfirm(next ?? '')}
        autoComplete="new-password"
        showStrengthMeter={false}
        disabled={busy}
      />
      {nextPhraseConfirm.length > 0 && nextPhrase !== nextPhraseConfirm && (
        <Paragraph margin="none" className="text-destructive text-sm">
          Passphrases do not match.
        </Paragraph>
      )}
      {error && (
        <div
          className="bg-destructive text-destructive-contrast rounded p-4"
          role="alert"
        >
          <Paragraph margin="none">{error}</Paragraph>
        </div>
      )}
      <div className="mt-4 mb-6 flex gap-2">
        <Button onClick={() => void handleSave()} disabled={busy}>
          {busy ? 'Saving…' : 'Save new passphrase'}
        </Button>
        <Button color="secondary" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
      </div>
    </>
  );
}

export function ManageAuthenticator() {
  const auth = useAuth();
  const [changing, setChanging] = useState(false);

  const canChange = auth.mode === 'pin' || auth.mode === 'passphrase';

  return (
    <section>
      <Heading level="label" margin="none">
        {auth.mode === 'none' ? 'Device lock' : 'Authenticator'}
      </Heading>
      {auth.mode === 'none' && (
        <Paragraph intent="smallText" emphasis="muted">
          No device lock is configured. Data on this device is not encrypted at
          the app layer. To enable a lock, reset the device first and run setup
          again.
        </Paragraph>
      )}
      <dl className="font-monospace mt-4 mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-text/60">Mode</dt>
        <dd>{auth.mode ? (MODE_LABEL[auth.mode] ?? auth.mode) : 'unknown'}</dd>
      </dl>

      {canChange && changing && auth.mode === 'pin' && (
        <ChangePinForm onDone={() => setChanging(false)} />
      )}
      {canChange && changing && auth.mode === 'passphrase' && (
        <ChangePassphraseForm onDone={() => setChanging(false)} />
      )}

      {canChange && !changing && (
        <SettingsRow
          title={auth.mode === 'pin' ? 'Change PIN' : 'Change passphrase'}
          desc={
            auth.mode === 'pin'
              ? 'Replace your 8-digit PIN with a new one. Your data stays intact.'
              : 'Replace your passphrase with a new one. Your data stays intact.'
          }
          control={
            <Button
              onClick={() => setChanging(true)}
              icon={<KeyRound className="size-4" />}
            >
              {auth.mode === 'pin' ? 'Change PIN' : 'Change passphrase'}
            </Button>
          }
        />
      )}

      {auth.mode === 'biometric' && (
        <Paragraph intent="smallText" emphasis="muted">
          To change your unlock method, reset the device and run setup again.
          Resetting destroys all data on this device.
        </Paragraph>
      )}
    </section>
  );
}

export function ResetDeviceRow() {
  const auth = useAuth();
  const { confirm } = useDialog();

  const handleRevoke = async () => {
    await confirm({
      title:
        auth.mode === 'none'
          ? 'Reset device and wipe data?'
          : 'Revoke device lock and wipe data?',
      description: 'This will destroy all data on this device. Continue?',
      confirmLabel: 'Destroy device data',
      intent: 'destructive',
      onConfirm: async () => {
        await auth.revoke();
      },
    });
  };

  const isReset = auth.mode === 'none';
  return (
    <SettingsRow
      title={isReset ? 'Reset device' : 'Revoke device lock'}
      desc="Destroy all protocols, sessions, and stored credentials on this device, then restart setup."
      control={
        <Button
          color="destructive"
          onClick={() => void handleRevoke()}
          icon={<ShieldOff className="size-4" />}
        >
          {isReset ? 'Reset device' : 'Revoke'}
        </Button>
      }
    />
  );
}
