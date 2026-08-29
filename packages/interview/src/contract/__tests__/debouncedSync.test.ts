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

const change = { immediate: false, unloading: false };
const now = { immediate: true, unloading: false };
// The document is going away and may never run script again.
const unloading = { immediate: true, unloading: true };

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
      { immediate: false, unloading: false },
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
      { immediate: false, unloading: false },
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
      { immediate: true, unloading: false },
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

  it('does not write faster than the rate limit when changes arrive mid-write', async () => {
    // The window has to cover the write as well as the pause after it.
    // Otherwise a change arriving while a request is on the wire is written
    // the moment that request lands, and sustained answering on a slow link
    // posts the whole network at request-latency cadence.
    const write = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    // Nine seconds of continuous answering, each write taking 500ms.
    for (let i = 1; i <= 90; i += 1) {
      void handler('interview-1', session(`${i}`), change);
      await vi.advanceTimersByTimeAsync(100);
    }

    // The leading write plus roughly one per 3s window.
    expect(write.mock.calls.length).toBeLessThanOrEqual(5);
    expect(write.mock.calls.length).toBeGreaterThan(1);
  });

  it('does not let a burst in one tick buy a write apiece', async () => {
    // A gesture can dispatch several session changes in a single tick — an
    // automatic-layout settle emits one per node. Each is offered before the
    // first scheduled write has had a chance to start, so a handler that only
    // notices writes once they are running reads as quiet every time and
    // schedules one write per change. Every extra then drains whatever has
    // accumulated the moment the write in front of it lands.
    const write = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    for (let i = 1; i <= 10; i += 1) {
      void handler('interview-1', session(`0${i}`), change);
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    // One more while that write is on the wire, then land it. The window opens
    // as it lands, so nothing further may go out for 3s.
    void handler('interview-1', session('11'), change);
    await vi.advanceTimersByTimeAsync(600);

    expect(write).toHaveBeenCalledTimes(1);
  });

  it('never puts two ordinary writes on the wire at once', async () => {
    let inFlight = 0;
    let concurrent = 0;
    const write = vi.fn(async () => {
      inFlight += 1;
      concurrent = Math.max(concurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 50));
      inFlight -= 1;
    });
    const handler = createDebouncedSyncHandler(write, { waitMs: 10 });

    for (let i = 1; i <= 6; i += 1) {
      void handler('interview-1', session(`0${i}`), change);
      await vi.advanceTimersByTimeAsync(15);
    }
    await vi.advanceTimersByTimeAsync(500);

    expect(concurrent).toBe(1);
  });

  it('issues an unloading write rather than queueing it behind one on the wire', async () => {
    let releaseFirst!: () => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const handler = createDebouncedSyncHandler(write, { waitMs: 3000 });

    void handler('interview-1', session('01'), change);
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    // Queueing this behind the held write would be fatal at teardown: the
    // request in front dies with the document and the continuation never runs,
    // so the newest answers would never be sent at all.
    void handler('interview-1', session('02'), unloading);
    await vi.advanceTimersByTimeAsync(0);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '02' }),
      { immediate: true, unloading: true },
    );

    releaseFirst();
  });

  it('collapses a burst into two writes with no wait at all', async () => {
    // How the Interviewer is configured: never hold an answer on a timer, but
    // still turn one gesture's worth of updates — an automatic-layout settle
    // dispatches one per node — into a single write of the final state.
    let releaseFirst!: () => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const handler = createDebouncedSyncHandler(write, { waitMs: 0 });

    void handler('interview-1', session('01'), change);
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);

    for (let i = 2; i <= 20; i += 1) {
      void handler('interview-1', session(`${i}`), change);
    }
    releaseFirst();
    await vi.advanceTimersByTimeAsync(10);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '20' }),
      { immediate: false, unloading: false },
    );
  });
});
