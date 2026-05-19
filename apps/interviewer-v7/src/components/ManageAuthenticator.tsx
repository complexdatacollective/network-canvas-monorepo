import { KeyRound, ShieldOff } from 'lucide-react';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

const PIN_PATTERN = /^\d{8}$/;

function truncateCredentialId(credentialIdB64: string): string {
  if (credentialIdB64.length <= 12) return credentialIdB64;
  return `${credentialIdB64.slice(0, 8)}…${credentialIdB64.slice(-4)}`;
}

export function ManageAuthenticator() {
  const auth = useAuth();
  const { confirm } = useDialog();
  const toast = useToast();
  const [showPinForm, setShowPinForm] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [nextPinConfirm, setNextPinConfirm] = useState('');
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const credentialIdB64 = auth.credentialMetadata?.credentialIdB64;
  const enrolledAt =
    auth.credentialMetadata?.enrolledAt ?? auth.pinMetadata?.enrolledAt;

  const handleReEnrol = async () => {
    await confirm({
      title: 'Re-enrol authenticator?',
      description:
        'You will be prompted to authenticate with your current authenticator, then to create a new one. The previous credential remains usable if either step fails.',
      confirmLabel: 'Re-enrol',
      intent: 'default',
      onConfirm: async (signal) => {
        const result = await auth.reEnrol(signal);
        if (!result.ok) {
          toast.add({
            title: 'Re-enrolment failed',
            description:
              result.message ?? 'The previous authenticator remains in use.',
            variant: 'destructive',
          });
          throw new Error(result.message ?? 'Re-enrolment failed');
        }
        toast.add({
          title: 'Authenticator re-enrolled',
          variant: 'success',
        });
      },
    });
  };

  const handleChangePin = async () => {
    setPinError(null);
    if (!PIN_PATTERN.test(nextPin)) {
      setPinError('New PIN must be exactly 8 digits.');
      return;
    }
    if (nextPin !== nextPinConfirm) {
      setPinError('The two new PINs do not match.');
      return;
    }
    setPinBusy(true);
    try {
      const result = await auth.reEnrolWithPin({ currentPin, nextPin });
      if (result.ok) {
        toast.add({ title: 'PIN changed', variant: 'success' });
        setShowPinForm(false);
        setCurrentPin('');
        setNextPin('');
        setNextPinConfirm('');
        return;
      }
      setPinError(result.message ?? 'Could not change PIN.');
    } finally {
      setPinBusy(false);
    }
  };

  const handleRevoke = async () => {
    await confirm({
      title:
        auth.mode === 'pin'
          ? 'Revoke PIN and wipe data?'
          : auth.mode === 'none'
            ? 'Reset device and wipe data?'
            : 'Revoke authenticator?',
      description: 'This will destroy all data on this device. Continue?',
      confirmLabel: 'Destroy device data',
      intent: 'destructive',
      onConfirm: async () => {
        await auth.revoke();
      },
    });
  };

  return (
    <section className="flex flex-col gap-4">
      <Heading level="h3">
        {auth.mode === 'pin'
          ? 'Manage PIN'
          : auth.mode === 'none'
            ? 'Device lock'
            : 'Manage authenticator'}
      </Heading>
      {auth.mode === 'none' && (
        <Paragraph emphasis="muted" margin="none">
          No device lock is configured. Data on this device is not encrypted at
          the app layer. To enable a lock, revoke first and run setup again.
        </Paragraph>
      )}
      <dl className="font-monospace grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-text/60">Mode</dt>
        <dd>{auth.mode ?? 'unknown'}</dd>
        {credentialIdB64 && (
          <>
            <dt className="text-text/60">Credential</dt>
            <dd>{truncateCredentialId(credentialIdB64)}</dd>
          </>
        )}
        <dt className="text-text/60">Enrolled</dt>
        <dd>
          {enrolledAt ? <TimeAgo date={enrolledAt} /> : <span>unknown</span>}
        </dd>
      </dl>

      {auth.mode === 'pin' && showPinForm && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Current PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="current-password"
              value={currentPin}
              onChange={(e) =>
                setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 8))
              }
              disabled={pinBusy}
              className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-lg tracking-widest"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">New PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="new-password"
              value={nextPin}
              onChange={(e) =>
                setNextPin(e.target.value.replace(/\D/g, '').slice(0, 8))
              }
              disabled={pinBusy}
              className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-lg tracking-widest"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Confirm new PIN</span>
            <input
              type="password"
              inputMode="numeric"
              maxLength={8}
              autoComplete="new-password"
              value={nextPinConfirm}
              onChange={(e) =>
                setNextPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 8))
              }
              disabled={pinBusy}
              className="border-surface-2 bg-surface-1 font-monospace rounded-lg border px-3 py-2 text-lg tracking-widest"
            />
          </label>
          {pinError && (
            <Paragraph emphasis="muted" margin="none">
              {pinError}
            </Paragraph>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void handleChangePin()} disabled={pinBusy}>
              {pinBusy ? 'Saving…' : 'Save new PIN'}
            </Button>
            <Button
              color="secondary"
              onClick={() => {
                setShowPinForm(false);
                setPinError(null);
              }}
              disabled={pinBusy}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {auth.mode === 'pin' && !showPinForm && (
          <Button
            onClick={() => setShowPinForm(true)}
            icon={<KeyRound className="size-4" />}
          >
            Change PIN
          </Button>
        )}
        {auth.mode === 'webauthn' && (
          <Button
            onClick={() => void handleReEnrol()}
            icon={<KeyRound className="size-4" />}
          >
            Re-enrol authenticator
          </Button>
        )}
        <Button
          color="destructive"
          onClick={() => void handleRevoke()}
          icon={<ShieldOff className="size-4" />}
        >
          {auth.mode === 'none' ? 'Reset device' : 'Revoke'}
        </Button>
      </div>
    </section>
  );
}
