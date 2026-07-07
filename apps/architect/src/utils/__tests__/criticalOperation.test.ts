import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AUTOSAVE_PENDING_WINDOW_MS,
  isCriticalOperationInProgress,
  markAutosavePending,
  setExportInProgress,
  setImportInProgress,
  subscribeCriticalOperation,
} from '../criticalOperation';

afterEach(() => {
  vi.useRealTimers();
  setImportInProgress(false);
  setExportInProgress(false);
});

describe('criticalOperation signal', () => {
  it('reports true while an import or export is in progress', () => {
    expect(isCriticalOperationInProgress()).toBe(false);

    setImportInProgress(true);
    expect(isCriticalOperationInProgress()).toBe(true);

    setImportInProgress(false);
    expect(isCriticalOperationInProgress()).toBe(false);

    setExportInProgress(true);
    expect(isCriticalOperationInProgress()).toBe(true);
  });

  it('stays true until every operation clears', () => {
    setImportInProgress(true);
    setExportInProgress(true);
    setImportInProgress(false);
    expect(isCriticalOperationInProgress()).toBe(true);
    setExportInProgress(false);
    expect(isCriticalOperationInProgress()).toBe(false);
  });

  it('notifies subscribers on change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCriticalOperation(listener);

    setImportInProgress(true);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setImportInProgress(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // #812: after a stage commit the draft-dirty flag clears immediately, but the
  // edit is only persisted after the autosave debounce + write. markAutosavePending
  // must keep the operation critical across that window so an update reload defers.
  it('stays critical for the autosave window after a commit, then clears', () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    subscribeCriticalOperation(listener);

    expect(isCriticalOperationInProgress()).toBe(false);

    markAutosavePending();
    expect(isCriticalOperationInProgress()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(AUTOSAVE_PENDING_WINDOW_MS - 1);
    expect(isCriticalOperationInProgress()).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isCriticalOperationInProgress()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('extends the autosave window when re-flagged before it lapses', () => {
    vi.useFakeTimers();

    markAutosavePending();
    vi.advanceTimersByTime(AUTOSAVE_PENDING_WINDOW_MS - 100);
    // A second commit lands just before the first window closes.
    markAutosavePending();

    vi.advanceTimersByTime(200);
    expect(isCriticalOperationInProgress()).toBe(true);

    vi.advanceTimersByTime(AUTOSAVE_PENDING_WINDOW_MS);
    expect(isCriticalOperationInProgress()).toBe(false);
  });
});
