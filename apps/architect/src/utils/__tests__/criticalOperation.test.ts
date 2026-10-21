import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  beginExport,
  beginProtocolCommit,
  isCriticalOperationInProgress,
  setImportInProgress,
  subscribeCriticalOperation,
  whenCriticalOperationsSettle,
} from '../criticalOperation';

// Each test finishes what it began; this only clears the boolean import flag.
afterEach(() => {
  setImportInProgress(false);
});

describe('criticalOperation signal', () => {
  it('reports true while an import or export is in progress', () => {
    expect(isCriticalOperationInProgress()).toBe(false);

    setImportInProgress(true);
    expect(isCriticalOperationInProgress()).toBe(true);

    setImportInProgress(false);
    expect(isCriticalOperationInProgress()).toBe(false);

    const finishExport = beginExport();
    expect(isCriticalOperationInProgress()).toBe(true);
    finishExport();
    expect(isCriticalOperationInProgress()).toBe(false);
  });

  it('stays true until every operation clears', () => {
    setImportInProgress(true);
    const finishExport = beginExport();
    setImportInProgress(false);
    expect(isCriticalOperationInProgress()).toBe(true);
    finishExport();
    expect(isCriticalOperationInProgress()).toBe(false);
  });

  it('stays critical until every overlapping export settles', () => {
    // Two library rows downloading at once: the first to finish must not
    // release the second, or leaving for Architect 8 would cut it off.
    const finishFirst = beginExport();
    const finishSecond = beginExport();

    finishFirst();
    finishFirst();
    expect(isCriticalOperationInProgress()).toBe(true);

    finishSecond();
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

describe('whenCriticalOperationsSettle', () => {
  it('resolves at once when nothing is in flight', async () => {
    await expect(whenCriticalOperationsSettle()).resolves.toBeUndefined();
  });

  it('waits for every in-flight commit and operation to finish', async () => {
    const finishCommit = beginProtocolCommit();
    const finishExport = beginExport();
    let settled = false;
    const waiting = whenCriticalOperationsSettle().then(() => {
      settled = true;
    });

    finishCommit();
    await Promise.resolve();
    expect(settled).toBe(false);

    finishExport();
    await waiting;
    expect(settled).toBe(true);
  });
});
