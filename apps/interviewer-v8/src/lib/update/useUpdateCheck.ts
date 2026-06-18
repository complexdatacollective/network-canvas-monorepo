import { createElement, useCallback, useEffect, useState } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import { UpdateActions, UpdateNotes } from '~/components/UpdateDialog';
import { getSettings, updateSettings } from '~/lib/db/api';

import { checkForUpdate } from './checkForUpdate';
import type { UpdateInfo } from './types';

// Module-level so the check runs once per app session, not once per Home mount
// (HomeRoute remounts when navigating back from an interview). `cachedUpdate`
// re-hydrates the badge state on remount without re-running the check.
let hasRun = false;
let cachedUpdate: UpdateInfo | null = null;

export type UseUpdateCheck = {
  availableUpdate: UpdateInfo | null;
  openUpdateDialog: (info: UpdateInfo) => void;
};

// Runs the launch-time update check exactly once. On a fresh, non-skipped
// release it raises a toast; clicking the toast (or the home-screen badge)
// opens a dialog with the rendered release notes and a platform-specific
// action. Returns the available update (independent of skip/dismiss, which only
// govern the toast) so the home screen can show a persistent badge.
// Best-effort — any failure in checkForUpdate resolves to null and is ignored.
export function useUpdateCheck(): UseUpdateCheck {
  const toast = useToast();
  const dialog = useDialog();
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(
    cachedUpdate,
  );

  const skipRelease = useCallback(async (version: string) => {
    try {
      const settings = await getSettings();
      if (settings.dismissedUpdates.includes(version)) return;
      await updateSettings({
        dismissedUpdates: [...settings.dismissedUpdates, version],
      });
    } catch {
      // Best-effort: failing to persist a skip just means the toast may
      // reappear next launch.
    }
  }, []);

  const openNotesDialog = useCallback(
    (info: UpdateInfo) => {
      const dialogId = crypto.randomUUID();
      void dialog.openDialog({
        type: 'custom',
        id: dialogId,
        title: info.releaseName,
        children: createElement(UpdateNotes, { info }),
        footer: createElement(UpdateActions, {
          info,
          onClose: () => void dialog.closeDialog(dialogId, null),
        }),
      });
    },
    [dialog],
  );

  const showToast = useCallback(
    (info: UpdateInfo) => {
      const toastId = crypto.randomUUID();
      toast.add({
        id: toastId,
        title: 'Update available',
        description: `Version ${info.version} is available.`,
        variant: 'info',
        timeout: 0,
        // Clicking the toast opens the release-notes dialog; the close (X)
        // dismisses; the single action button skips this release.
        onClick: () => {
          openNotesDialog(info);
          toast.close(toastId);
        },
        cancelLabel: 'Skip this release',
        onCancel: () => {
          void skipRelease(info.version);
          toast.close(toastId);
        },
      });
    },
    [toast, openNotesDialog, skipRelease],
  );

  useEffect(() => {
    if (hasRun) return;
    hasRun = true;

    void (async () => {
      try {
        const info = await checkForUpdate();
        cachedUpdate = info;
        setAvailableUpdate(info);
        if (!info) return;
        const settings = await getSettings();
        if (settings.dismissedUpdates.includes(info.version)) return;
        showToast(info);
      } catch {
        // Best-effort: a failed launch check must never disrupt the app.
      }
    })();
  }, [showToast]);

  return { availableUpdate, openUpdateDialog: openNotesDialog };
}
