// A tiny non-redux signal for operations that must not be interrupted by a
// service-worker update reload: a .netcanvas import (which can start before React
// mounts, from the OS file handler) and a protocol export. Kept out of the redux
// `app` slice because that slice is persisted — a flag stuck `true` after a tab
// closed mid-operation would wrongly block updates forever. Read via
// useSyncExternalStore so a React component re-renders when it changes.

let importInProgress = false;
let exportInProgress = false;
let autosavePendingUntil = 0;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

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

// Committing a stage edit clears the stage-editor draft-dirty flag immediately,
// but the committed edit lives only in the redux slice until the autosave
// listener's debounce (600ms) elapses and its async IndexedDB write resolves.
// A reload during that window silently discards the just-committed edit. This
// signal marks that window as critical without touching the autosave listener:
// callers flag a commit, and it self-clears after a duration covering the
// debounce plus write. Re-flagging extends the window (a fresh edit restarts the
// debounce). The timer is deliberately not persisted or reference-counted — a
// closed tab simply lets the window lapse.
export const AUTOSAVE_PENDING_WINDOW_MS = 2_000;

export const markAutosavePending = () => {
  autosavePendingUntil = Date.now() + AUTOSAVE_PENDING_WINDOW_MS;
  if (autosaveTimer !== null) {
    clearTimeout(autosaveTimer);
  }
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    autosavePendingUntil = 0;
    emit();
  }, AUTOSAVE_PENDING_WINDOW_MS);
  emit();
};

export const isCriticalOperationInProgress = () =>
  importInProgress || exportInProgress || Date.now() < autosavePendingUntil;

export const subscribeCriticalOperation = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
