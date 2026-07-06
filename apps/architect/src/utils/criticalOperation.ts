// A tiny non-redux signal for operations that must not be interrupted by a
// service-worker update reload: a .netcanvas import (which can start before React
// mounts, from the OS file handler) and a protocol export. Kept out of the redux
// `app` slice because that slice is persisted — a flag stuck `true` after a tab
// closed mid-operation would wrongly block updates forever. Read via
// useSyncExternalStore so a React component re-renders when it changes.

let importInProgress = false;
let exportInProgress = false;

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

export const isCriticalOperationInProgress = () =>
  importInProgress || exportInProgress;

export const subscribeCriticalOperation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
