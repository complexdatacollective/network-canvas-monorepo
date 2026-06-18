import { createElement, useCallback, useEffect } from 'react';

import useDialog from '@codaco/fresco-ui/dialogs/useDialog';
import { useToast } from '@codaco/fresco-ui/Toast';
import {
  UpdateActions,
  UpdateNotes,
  UpdateToastActions,
} from '~/components/UpdateDialog';
import { getSettings, updateSettings } from '~/lib/db/api';

import { checkForUpdate } from './checkForUpdate';
import type { UpdateInfo } from './types';

// Module-level so the check runs once per app session, not once per Home mount
// (HomeRoute remounts when navigating back from an interview).
let hasRun = false;

function formatPublishedAt(publishedAt: string | null): string | undefined {
  if (!publishedAt) return undefined;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(date);
}

// Runs the launch-time update check exactly once. On a fresh, non-skipped
// release it raises a toast; the toast's "View details" opens a dialog with the
// rendered release notes and a platform-specific action. Best-effort — any
// failure in checkForUpdate resolves to null and is silently ignored.
export function useUpdateCheck(): void {
  const toast = useToast();
  const dialog = useDialog();

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
        description: formatPublishedAt(info.publishedAt),
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
        variant: 'info',
        timeout: 0,
        description: createElement(UpdateToastActions, {
          info,
          onView: () => {
            openNotesDialog(info);
            toast.close(toastId);
          },
          onSkip: () => {
            void skipRelease(info.version);
            toast.close(toastId);
          },
          onDismiss: () => toast.close(toastId),
        }),
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
        if (!info) return;
        const settings = await getSettings();
        if (settings.dismissedUpdates.includes(info.version)) return;
        showToast(info);
      } catch {
        // Best-effort: a failed launch check must never disrupt the app.
      }
    })();
  }, [showToast]);
}
