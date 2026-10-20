// Captures .netcanvas files delivered by the OS when the installed PWA is
// launched as a file handler (Chromium desktop File Handling API; declared
// via the manifest's file_handlers). Registered pre-React, as an external
// store, because the launch consumer can fire before any subscriber exists.
//
// Safari and Firefox never define window.launchQueue; everything here is a
// silent no-op there.

import { reportError } from './reportError';

let pendingFiles: File[] = [];
let pendingReadFailures: number[] = [];
let pendingLaunchReads = 0;
const listeners = new Set<() => void>();
const readFailureListeners = new Set<() => void>();
let initialized = false;

const emit = () => {
  for (const listener of listeners) listener();
};

const emitReadFailure = () => {
  for (const listener of readFailureListeners) listener();
};

// Surface a user-facing error when the OS hands us handles we can't read.
const reportLaunchReadFailure = (failedCount: number): void => {
  pendingReadFailures = [...pendingReadFailures, failedCount];
  emitReadFailure();
};

// Count a read in flight for `hasPendingLaunchFiles`, so the startup update
// check holds while it runs, then queue whatever files it produced.
const trackLaunchRead = (
  read: () => Promise<File[]>,
  operation: string,
): void => {
  pendingLaunchReads += 1;
  emit();
  void read()
    .then((files) => {
      if (files.length === 0) return;
      pendingFiles = [...pendingFiles, ...files];
      emit();
    })
    .catch((error: unknown) => {
      reportError(error, { operation });
    })
    .finally(() => {
      pendingLaunchReads -= 1;
      emit();
    });
};

type LaunchCaptureOptions = {
  /**
   * Decide what happens to launched .netcanvas files before they are queued:
   * resolve with the files this app should still open itself. Architect 8
   * served inside Architect 9 hands them on to Architect 9 instead.
   */
  routeFiles?: (files: File[]) => Promise<File[]>;
};

export const initFileLaunchCapture = (
  options: LaunchCaptureOptions = {},
): void => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const queue = window.launchQueue;
  if (!queue) return;
  queue.setConsumer((params) => {
    trackLaunchRead(async () => {
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
          reportError(failure.reason, { operation: 'fileLaunchRead' });
        }
        reportLaunchReadFailure(failures.length);
      }

      const netcanvas = files.filter((file) =>
        file.name.toLowerCase().endsWith('.netcanvas'),
      );
      if (netcanvas.length === 0) return [];
      return options.routeFiles ? options.routeFiles(netcanvas) : netcanvas;
    }, 'fileLaunchHandle');
  });
};

export const subscribeLaunchFiles = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const subscribeLaunchReadFailures = (
  listener: () => void,
): (() => void) => {
  readFailureListeners.add(listener);
  return () => {
    readFailureListeners.delete(listener);
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

export const takeLaunchReadFailures = (): number[] => {
  const taken = pendingReadFailures;
  if (taken.length === 0) return taken;
  pendingReadFailures = [];
  emitReadFailure();
  return taken;
};
