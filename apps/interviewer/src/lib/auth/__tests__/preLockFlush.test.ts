import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PRE_LOCK_FLUSH_TIMEOUT_MS,
  registerPreLockFlush,
  runPreLockFlush,
} from '../preLockFlush';

// The registry is module state, so a test that leaves a flush behind would run
// it in every later test. Register through this and it is always cleaned up.
const disposers: Array<() => void> = [];
function register(flush: () => Promise<void>) {
  disposers.push(registerPreLockFlush(flush));
}

afterEach(() => {
  while (disposers.length > 0) disposers.pop()?.();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pre-lock flush registry', () => {
  it('runs every registered flush', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    register(first);
    register(second);

    await runPreLockFlush();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops running a flush once its registrant disposes it', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const dispose = registerPreLockFlush(flush);

    dispose();
    await runPreLockFlush();

    expect(flush).not.toHaveBeenCalled();
  });

  it('gives up on a flush that never settles, so locking is never blocked', async () => {
    vi.useFakeTimers();
    // A write wedged in IndexedDB: the promise the flush returns never settles.
    register(() => new Promise<void>(() => undefined));

    let settled = false;
    const run = (async () => {
      await runPreLockFlush();
      settled = true;
    })();

    await vi.advanceTimersByTimeAsync(PRE_LOCK_FLUSH_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await run;
    expect(settled).toBe(true);
  });

  it('reports a failing flush and still runs the others', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const failure = new Error('quota exceeded');
    const sibling = vi.fn().mockResolvedValue(undefined);
    register(() => Promise.reject(failure));
    register(sibling);

    // Resolves rather than rejecting: a failed flush must not stop the lock.
    await expect(runPreLockFlush()).resolves.toBeUndefined();

    expect(sibling).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('pre-lock flush failed'),
      failure,
    );
  });

  it('leaves no pending timer when nothing is registered', async () => {
    vi.useFakeTimers();

    await runPreLockFlush();

    expect(vi.getTimerCount()).toBe(0);
  });
});
