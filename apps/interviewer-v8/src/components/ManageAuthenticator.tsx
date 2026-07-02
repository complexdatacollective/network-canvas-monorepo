import { ShieldOff } from 'lucide-react';

import Button from '@codaco/fresco-ui/Button';
import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
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

export function ManageAuthenticator() {
  const auth = useAuth();

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
      {auth.mode !== 'none' && (
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
