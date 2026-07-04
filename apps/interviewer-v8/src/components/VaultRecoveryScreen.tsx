import { motion } from 'motion/react';
import { useState } from 'react';

import { BackgroundLights } from '@codaco/art';
import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAuth } from '~/lib/auth/AuthContext';

// Shown when the vault record exists but can't be read (corrupt, or written by a
// newer app version than the one now running — e.g. a service-worker rollback on
// the beta lane). We must NOT treat this as an unconfigured device: fresh setup
// would overwrite the only wrapped copy of the DEK and orphan the encrypted data
// forever. Instead we offer a non-destructive reload (a newer build may read the
// record) and, only behind an explicit confirmation, a full reset.
export function VaultRecoveryScreen() {
  const { revoke } = useAuth();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleReset = async () => {
    setResetting(true);
    setResetError(null);
    try {
      // revoke() wipes the encrypted database and clears the vault record, then
      // refreshes auth state — the app falls through to first-run setup.
      await revoke();
    } catch {
      // On the one screen meant to rescue the user, a failed reset must not
      // leave both buttons permanently disabled — re-enable and surface it.
      setResetError('Something went wrong. Please try again.');
      setResetting(false);
    }
  };

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
      {confirmingReset ? (
        <Dialog
          open
          dismissible={false}
          title="Reset all app data?"
          description="This permanently deletes every protocol and recorded interview on this device. It cannot be undone, and the existing data cannot be recovered."
          footer={
            <div className="flex gap-3">
              <Button
                color="secondary"
                disabled={resetting}
                onClick={() => setConfirmingReset(false)}
              >
                Cancel
              </Button>
              <Button
                color="destructive"
                disabled={resetting}
                onClick={() => void handleReset()}
              >
                {resetting ? 'Resetting…' : 'Permanently delete'}
              </Button>
            </div>
          }
        >
          {resetError && (
            <Paragraph margin="none" className="text-destructive text-sm">
              {resetError}
            </Paragraph>
          )}
        </Dialog>
      ) : (
        <Dialog
          open
          dismissible={false}
          title="Can't read this device's security settings"
          footer={
            <div className="flex gap-3">
              <Button onClick={() => window.location.reload()}>Reload</Button>
              <Button
                color="destructive"
                onClick={() => setConfirmingReset(true)}
              >
                Reset all app data
              </Button>
            </div>
          }
        >
          <Paragraph>
            The security configuration stored on this device could not be read.
            This can happen if the app was updated and then rolled back, so a
            newer version wrote settings this version doesn&apos;t understand.
          </Paragraph>
          <Paragraph>
            Try <strong>Reload</strong> first — if a newer version of the app is
            available it may be able to read these settings. If reloading
            doesn&apos;t help, you can reset the app to start over, but any data
            already on this device will be lost.
          </Paragraph>
        </Dialog>
      )}
    </>
  );
}
