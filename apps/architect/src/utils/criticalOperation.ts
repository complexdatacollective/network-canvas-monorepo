// A tiny non-redux signal for operations that must not be interrupted by a
// service-worker update reload: a .netcanvas import (which can start before React
// mounts, from the OS file handler), a protocol export or library download, and
// a protocol commit. Kept out of the redux `app` slice because that slice is
// persisted — a flag stuck `true` after a tab closed mid-operation would
// wrongly block updates forever. Read via useSyncExternalStore so a React
// component re-renders when it changes.

let importInProgress = false;
let exportsInProgress = 0;
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

// Exports and commits are reference-counted, because they overlap: the library
// can bundle several protocols at once, alongside an export from the editor,
// and the first to finish must not mark the others done. Each `begin…` returns
// the function to call once that operation settles; calling it again is a
// no-op.
const beginCounted = (adjust: (delta: 1 | -1) => void): (() => void) => {
  adjust(1);
  emit();

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    adjust(-1);
    emit();
  };
};

/** A protocol bundling into a `.netcanvas` download, from editor or library. */
export const beginExport = (): (() => void) =>
  beginCounted((delta) => {
    exportsInProgress = Math.max(0, exportsInProgress + delta);
  });

// A commit is critical from the moment validation is queued until its accepted
// snapshot has finished writing to IndexedDB.
export const beginProtocolCommit = (): (() => void) =>
  beginCounted((delta) => {
    protocolCommitsInProgress = Math.max(0, protocolCommitsInProgress + delta);
  });

export const isCriticalOperationInProgress = () =>
  importInProgress || exportsInProgress > 0 || protocolCommitsInProgress > 0;

export const subscribeCriticalOperation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/**
 * Resolves once no critical operation is in flight — immediately when none
 * is. For a full-page navigation away from Architect, which would otherwise
 * abandon a commit half-written to IndexedDB, or an import or export midway.
 */
export const whenCriticalOperationsSettle = (): Promise<void> =>
  new Promise((resolve) => {
    if (!isCriticalOperationInProgress()) {
      resolve();
      return;
    }
    const unsubscribe = subscribeCriticalOperation(() => {
      if (isCriticalOperationInProgress()) return;
      unsubscribe();
      resolve();
    });
  });
