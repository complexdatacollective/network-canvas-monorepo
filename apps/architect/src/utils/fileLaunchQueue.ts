// Captures .netcanvas files delivered by the OS when the installed PWA is
// launched as a file handler (Chromium desktop File Handling API; declared
// via the manifest's file_handlers). Registered pre-React, as an external
// store, because the launch consumer can fire before any subscriber exists.
//
// Safari and Firefox never define window.launchQueue; everything here is a
// silent no-op there.

import { generalErrorDialog } from '~/ducks/modules/userActions/dialogs';
import { store } from '~/ducks/store';

let pendingFiles: File[] = [];
let pendingLaunchReads = 0;
const listeners = new Set<() => void>();
let initialized = false;

const emit = () => {
  for (const listener of listeners) listener();
};

// Surface a user-facing error when the OS hands us handles we can't read.
const reportLaunchReadFailure = (failedCount: number): void => {
  const noun = failedCount === 1 ? 'file' : 'files';
  void store.dispatch(
    generalErrorDialog(
      'Could not open file',
      `${failedCount} launched ${noun} could not be read. The ${noun} may have been moved, deleted, or become unavailable since ${failedCount === 1 ? 'it was' : 'they were'} opened.`,
    ),
  );
};

export const initFileLaunchCapture = (): void => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const queue = window.launchQueue;
  if (!queue) return;
  queue.setConsumer((params) => {
    pendingLaunchReads += 1;
    emit();
    void (async () => {
      // allSettled so one unreadable handle (file moved/deleted, volume
      // unmounted between the OS launch and consumption) doesn't drop the whole
      // batch — read what we can and report the rest.
      const results = await Promise.allSettled(
        params.files.map((handle) => handle.getFile()),
      );

      const files = results
        .filter(
          (result): result is PromiseFulfilledResult<File> =>
            result.status === 'fulfilled',
        )
        .map((result) => result.value);
      const failures = results.filter((result) => result.status === 'rejected');

      if (failures.length > 0) {
        for (const failure of failures) {
          console.error('Failed to read launched file', failure.reason);
        }
        reportLaunchReadFailure(failures.length);
      }

      const netcanvas = files.filter((file) =>
        file.name.toLowerCase().endsWith('.netcanvas'),
      );
      if (netcanvas.length === 0) return;
      pendingFiles = [...pendingFiles, ...netcanvas];
      emit();
    })()
      .catch((error: unknown) => {
        console.error('Failed to handle launched files', error);
      })
      .finally(() => {
        pendingLaunchReads -= 1;
        emit();
      });
  });
};

export const subscribeLaunchFiles = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Stable snapshot for useSyncExternalStore: the array identity only changes
// when the contents change.
export const getLaunchFiles = (): File[] => pendingFiles;

export const hasPendingLaunchFiles = (): boolean =>
  pendingLaunchReads > 0 || pendingFiles.length > 0;

// Hand the pending files to a consumer exactly once.
export const takeLaunchFiles = (): File[] => {
  const taken = pendingFiles;
  if (taken.length === 0) return taken;
  pendingFiles = [];
  emit();
  return taken;
};
