import { motion } from 'motion/react';
import { useState } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { BackgroundLights } from '@codaco/art';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { RecoverByResettingDialog } from './UnlockForms/RecoverByResettingDialog';

const messages = defineMessages({
  canTReadThisDeviceSSecurity: {
    id: 'interviewer.vaultRecoveryScreen.canTReadThisDeviceSSecurity',
    defaultMessage: "Can't read this device's security settings",
    description: 'The title label in Interviewer Vault Recovery Screen.',
  },
  reload: {
    id: 'interviewer.vaultRecoveryScreen.reload',
    defaultMessage: 'Reload',
    description: 'Visible copy in Interviewer Vault Recovery Screen.',
  },
  resetAllAppData: {
    id: 'interviewer.vaultRecoveryScreen.resetAllAppData',
    defaultMessage: 'Reset all app data',
    description: 'Visible copy in Interviewer Vault Recovery Screen.',
  },
  theSecurityConfigurationStoredOnThisDevice: {
    id: 'interviewer.vaultRecoveryScreen.theSecurityConfigurationStoredOnThisDevice',
    defaultMessage:
      'The security configuration stored on this device could not be read. This can happen if the app was updated and then rolled back, so a newer version wrote settings this version doesn’t understand.',
    description: 'Visible copy in Interviewer Vault Recovery Screen.',
  },
  tryStrongReloadStrongFirstIfA: {
    id: 'interviewer.vaultRecoveryScreen.tryStrongReloadStrongFirstIfA',
    defaultMessage:
      'Try <strong>Reload</strong> first — if a newer version of the app is available it may be able to read these settings. If reloading doesn’t help, you can reset the app to start over, but any data already on this device will be lost.',
    description: 'Visible copy in Interviewer Vault Recovery Screen.',
  },
});

// Shown when the vault record exists but can't be read (corrupt, or written by a
// newer app version than the one now running — e.g. a service-worker rollback on
// the beta lane). We must NOT treat this as an unconfigured device: fresh setup
// would overwrite the only wrapped copy of the DEK and orphan the encrypted data
// forever. Instead we offer a non-destructive reload (a newer build may read the
// record) and, only behind an explicit confirmation, a full reset.
export function VaultRecoveryScreen() {
  const intl = useAppIntl();
  const [resetOpen, setResetOpen] = useState(false);

  return (
    <>
      <motion.div
        className="fixed inset-0 -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ duration: 2 }}
      >
        <BackgroundLights
          large={0}
          medium={4}
          small={0}
          blendMode="color-dodge"
          speedFactor={30}
        />
      </motion.div>
      <Dialog
        open={!resetOpen}
        dismissible={false}
        title={intl.formatMessage(messages.canTReadThisDeviceSSecurity)}
        footer={
          <div className="flex gap-3">
            <Button onClick={() => window.location.reload()}>
              {intl.formatMessage(messages.reload)}
            </Button>
            <Button color="destructive" onClick={() => setResetOpen(true)}>
              {intl.formatMessage(messages.resetAllAppData)}
            </Button>
          </div>
        }
      >
        <Paragraph>
          {intl.formatMessage(
            messages.theSecurityConfigurationStoredOnThisDevice,
          )}
        </Paragraph>
        <Paragraph>
          {intl.formatMessage(messages.tryStrongReloadStrongFirstIfA, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </Paragraph>
      </Dialog>
      <RecoverByResettingDialog
        open={resetOpen}
        onCancel={() => setResetOpen(false)}
        onReset={() => setResetOpen(false)}
      />
    </>
  );
}
