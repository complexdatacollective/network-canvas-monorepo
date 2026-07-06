import { afterEach, describe, expect, it, vi } from 'vitest';

import {
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
});
