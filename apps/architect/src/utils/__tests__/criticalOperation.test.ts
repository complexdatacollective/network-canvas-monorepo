import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginProtocolCommit,
  isCriticalOperationInProgress,
  setExportInProgress,
  setImportInProgress,
  subscribeCriticalOperation,
} from '../criticalOperation';

afterEach(() => {
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

  it('stays critical until a protocol commit actually settles', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCriticalOperation(listener);

    expect(isCriticalOperationInProgress()).toBe(false);

    const finish = beginProtocolCommit();
    expect(isCriticalOperationInProgress()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    finish();
    expect(isCriticalOperationInProgress()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('stays critical until every overlapping protocol commit settles', () => {
    const finishFirst = beginProtocolCommit();
    const finishSecond = beginProtocolCommit();

    finishFirst();
    expect(isCriticalOperationInProgress()).toBe(true);

    finishSecond();
    expect(isCriticalOperationInProgress()).toBe(false);
  });
});
