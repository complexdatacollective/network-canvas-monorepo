// Captures .netcanvas files delivered by the OS when the installed PWA is
// launched as a file handler (Chromium desktop File Handling API; declared
// via the manifest's file_handlers). Registered pre-React, as an external
// store, because the launch consumer can fire before any component mounts —
// and, in this app, before the vault is unlocked: files wait here until the
// Home screen (behind the auth gate) consumes them.
//
// Safari and Firefox never define window.launchQueue; everything here is a
// silent no-op there.

let pendingFiles: File[] = [];
let pendingFailureCount = 0;
let pendingLaunchReads = 0;
const listeners = new Set<() => void>();
let initialized = false;

const emit = () => {
  for (const listener of listeners) listener();
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
      // unmounted between the OS launch and consumption) doesn't drop the
      // whole batch — read what we can and surface the rest as a
      // user-facing failure count.
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
          // Only the aggregate count below reaches the user (a toast); the
          // reason a given handle failed to read is only visible here.
          // oxlint-disable-next-line no-console -- only diagnostic for why a launched file handle failed to read; the user only sees an aggregate failure count
          console.error('Failed to read launched file', failure.reason);
        }
        pendingFailureCount += failures.length;
      }

      const netcanvas = files.filter((file) =>
        file.name.toLowerCase().endsWith('.netcanvas'),
      );
      if (netcanvas.length === 0) {
        if (failures.length > 0) emit();
        return;
      }
      pendingFiles = [...pendingFiles, ...netcanvas];
      emit();
    })()
      .catch((error: unknown) => {
        // Unlike the per-file read failures above, nothing surfaces this
        // outer failure to the user at all — this is the only signal.
        // oxlint-disable-next-line no-console -- only diagnostic for this outer failure; nothing else reports it, unlike the per-file failures above
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

// Count of launched handles that failed to read since the last take. Shares
// the same subscription as the file queue so a single subscriber (Home,
// behind the auth gate) is notified of both.
export const getLaunchFailureCount = (): number => pendingFailureCount;

// Hand the pending failure count to a consumer exactly once, so a toast is
// shown for it only once.
export const takeLaunchFailureCount = (): number => {
  const taken = pendingFailureCount;
  if (taken === 0) return taken;
  pendingFailureCount = 0;
  emit();
  return taken;
};
