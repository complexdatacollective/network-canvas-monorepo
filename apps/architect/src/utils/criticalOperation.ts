// A tiny non-redux signal for operations that must not be interrupted by a
// service-worker update reload: a .netcanvas import (which can start before React
// mounts, from the OS file handler) and a protocol export. Kept out of the redux
// `app` slice because that slice is persisted — a flag stuck `true` after a tab
// closed mid-operation would wrongly block updates forever. Read via
// useSyncExternalStore so a React component re-renders when it changes.

let importInProgress = false;
let exportInProgress = false;
let protocolCommitsInProgress = 0;

const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
};

export const setImportInProgress = (value: boolean) => {
  importInProgress = value;
  emit();
};

export const setExportInProgress = (value: boolean) => {
  exportInProgress = value;
  emit();
};

// A commit is critical from the moment validation is queued until its accepted
// snapshot has finished writing to IndexedDB. Reference-count the real async
// lifecycle so overlapping commits are protected without a timer guess.
export const beginProtocolCommit = (): (() => void) => {
  protocolCommitsInProgress += 1;
  emit();

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    protocolCommitsInProgress = Math.max(0, protocolCommitsInProgress - 1);
    emit();
  };
};

/**
 * Resolves once no accepted protocol commit is still being written. A page
 * that is about to unload this app (to open Architect 8) waits on this, so the
 * last edit reaches the library before the page goes.
 */
export const waitForProtocolCommits = (): Promise<void> =>
  new Promise((resolve) => {
    if (protocolCommitsInProgress === 0) {
      resolve();
      return;
    }
    const unsubscribe = subscribeCriticalOperation(() => {
      if (protocolCommitsInProgress > 0) return;
      unsubscribe();
      resolve();
    });
  });

export const isCriticalOperationInProgress = () =>
  importInProgress || exportInProgress || protocolCommitsInProgress > 0;

export const subscribeCriticalOperation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
