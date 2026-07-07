import { useCallback } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';

import { useAuth } from './AuthContext';

const RESET_CONFIRM = {
  title: 'Reset all app data?',
  description:
    'This permanently deletes every protocol and recorded interview on this device. It cannot be undone, and the existing data cannot be recovered.',
  confirmLabel: 'Permanently delete',
} as const;

// The single confirmed destructive reset used wherever a user needs to start
// over: the corrupt-vault recovery screen and the lock screen's forgotten-
// credentials escape hatch. confirm() keeps its dialog open and surfaces the
// message if revoke() throws, so no bespoke loading/error state is needed.
export function useResetAppData(): () => Promise<void> {
  const { revoke } = useAuth();
  const { confirm } = useDialog();

  return useCallback(async () => {
    await confirm({
      title: RESET_CONFIRM.title,
      description: RESET_CONFIRM.description,
      confirmLabel: RESET_CONFIRM.confirmLabel,
      intent: 'destructive',
      // revoke() wipes the encrypted database and clears the vault record, then
      // refreshes auth state — the app falls through to first-run setup.
      onConfirm: async () => {
        await revoke();
      },
    });
  }, [confirm, revoke]);
}
