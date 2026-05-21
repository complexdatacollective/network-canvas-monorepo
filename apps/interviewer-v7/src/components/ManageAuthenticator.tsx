import { KeyRound, ShieldOff } from 'lucide-react';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import PasswordField from '@codaco/fresco-ui/form/fields/PasswordField';
import SegmentedCodeField from '@codaco/fresco-ui/form/fields/SegmentedCodeField';
import TimeAgo from '@codaco/fresco-ui/TimeAgo';
import { useToast } from '@codaco/fresco-ui/Toast';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { SettingsRow } from '~/components/SettingsRow';
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

  return (
    <section>
      <Heading level="label" margin="none">
        {auth.mode === 'pin'
          ? 'Manage PIN'
          : auth.mode === 'none'
            ? 'Device lock'
            : 'Manage authenticator'}
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
        <>
          <UnconnectedField
            name="currentPin"
            label="Current PIN"
            component={PasswordField}
            value={currentPin}
            onChange={(next) => setCurrentPin(next ?? '')}
            autoComplete="current-password"
            showStrengthMeter={false}
            disabled={pinBusy}
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
            disabled={pinBusy}
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
            disabled={pinBusy}
          />
          {pinError && <Paragraph emphasis="muted">{pinError}</Paragraph>}
          <div className="mb-6 flex gap-2">
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
        </>
      )}

      {auth.mode === 'pin' && !showPinForm && (
        <SettingsRow
          title="Change PIN"
          desc="Replace your current 8-digit PIN with a new one."
          control={
            <Button
              onClick={() => setShowPinForm(true)}
              icon={<KeyRound className="size-4" />}
            >
              Change PIN
            </Button>
          }
        />
      )}
      {auth.mode === 'webauthn' && (
        <SettingsRow
          title="Re-enrol authenticator"
          desc="Replace this device's authenticator while keeping all stored data."
          control={
            <Button
              onClick={() => void handleReEnrol()}
              icon={<KeyRound className="size-4" />}
            >
              Re-enrol authenticator
            </Button>
          }
        />
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
