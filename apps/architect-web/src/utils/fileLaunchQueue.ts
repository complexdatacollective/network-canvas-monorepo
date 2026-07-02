// Captures .netcanvas files delivered by the OS when the installed PWA is
// launched as a file handler (Chromium desktop File Handling API; declared
// via the manifest's file_handlers). Registered pre-React, as an external
// store, because the launch consumer can fire before any subscriber exists.
//
// Safari and Firefox never define window.launchQueue; everything here is a
// silent no-op there.

let pendingFiles: File[] = [];
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
    void (async () => {
      const files = await Promise.all(
        params.files.map((handle) => handle.getFile()),
      );
      const netcanvas = files.filter((file) =>
        file.name.toLowerCase().endsWith('.netcanvas'),
      );
      if (netcanvas.length === 0) return;
      pendingFiles = [...pendingFiles, ...netcanvas];
      emit();
    })().catch((error: unknown) => {
      // A handle.getFile() can reject (file moved/deleted, volume unmounted
      // between the OS launch and consumption). Nothing user-facing exists
      // this early, but don't let it vanish as an unhandled rejection.
      console.error('Failed to read launched file', error);
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

// Hand the pending files to a consumer exactly once.
export const takeLaunchFiles = (): File[] => {
  const taken = pendingFiles;
  if (taken.length === 0) return taken;
  pendingFiles = [];
  emit();
  return taken;
};
