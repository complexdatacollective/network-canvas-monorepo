import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebouncedSyncHandler } from '../debouncedSync';
import type { SessionPayload } from '../types';

const session = (lastUpdated: string) =>
  ({
    id: 'interview-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated,
    network: { ego: { _uid: 'ego-1' }, nodes: [], edges: [] },
  }) as unknown as SessionPayload;

const change = { immediate: false };
const now = { immediate: true };

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createDebouncedSyncHandler', () => {
  it('writes the first change straight away', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    void handler('interview-1', session('01'), change);
    await vi.advanceTimersByTimeAsync(0);

    // A participant's first answer is never left sitting in a timer.
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '01' }),
      { immediate: false },
    );
  });

  it('holds later changes and writes the newest once, together', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    void handler('interview-1', session('01'), change);
    await vi.advanceTimersByTimeAsync(0);
    void handler('interview-1', session('02'), change);
    void handler('interview-1', session('03'), change);
    await vi.advanceTimersByTimeAsync(0);

    // Still just the leading write: the rest are being batched.
    expect(write).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '03' }),
      { immediate: false },
    );
  });

  it('keeps writing while changes keep arriving, rather than starving them', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    void handler('interview-1', session('01'), change);
    await vi.advanceTimersByTimeAsync(0);

    // Sustained answering. A true debounce would reset its timer on every one
    // of these and write nothing until the participant stopped — the opposite
    // of what autosave is for. This is a rate limit, so writes keep landing.
    for (let i = 2; i <= 9; i += 1) {
      void handler('interview-1', session(`0${i}`), change);
      await vi.advanceTimersByTimeAsync(1000);
    }

    expect(write.mock.calls.length).toBeGreaterThan(1);
    expect(write.mock.calls.length).toBeLessThan(9);
  });

  it('writes now when told the write cannot be deferred', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    void handler('interview-1', session('01'), change);
    await vi.advanceTimersByTimeAsync(0);
    void handler('interview-1', session('02'), change);
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    void handler('interview-1', session('03'), now);
    await vi.advanceTimersByTimeAsync(0);

    // No timer advance: the wait was cancelled, and the held answer went out
    // alongside the new one.
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '03' }),
      { immediate: true },
    );
  });

  it('resolves a held change once a later write covers it', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    void handler('interview-1', session('01'), change);
    await vi.advanceTimersByTimeAsync(0);

    let held = false;
    const holding = handler('interview-1', session('02'), change).then(() => {
      held = true;
      return undefined;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(held).toBe(false);

    // The engine awaits this promise to know the answers are stored, so a
    // change swept up by a later write must resolve with it.
    void handler('interview-1', session('03'), now);
    await holding;
    expect(held).toBe(true);
  });

  it('rejects the waiting change when its write fails', async () => {
    const write = vi.fn().mockRejectedValue(new Error('Sync failed'));
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    // The engine treats a rejected sync as unsynced and offers the state
    // again, so a failure must reach it rather than being swallowed here.
    await expect(handler('interview-1', session('01'), now)).rejects.toThrow(
      'Sync failed',
    );
  });

  it('never puts two writes on the wire at once', async () => {
    let inFlight = 0;
    let concurrent = 0;
    const write = vi.fn(async () => {
      inFlight += 1;
      concurrent = Math.max(concurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      inFlight -= 1;
    });
    const handler = createDebouncedSyncHandler(write, { waitMs: 10 });

    void handler('interview-1', session('01'), change);
    void handler('interview-1', session('02'), now);
    void handler('interview-1', session('03'), now);
    void handler('interview-1', session('04'), now);
    await vi.advanceTimersByTimeAsync(500);

    expect(concurrent).toBe(1);
  });
});
