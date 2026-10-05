import {
  configureStore,
  createAction,
  type UnknownAction,
} from '@reduxjs/toolkit';
import { act } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

import { createDebouncedSyncHandler } from '../../../contract/debouncedSync';
import type { SessionState } from '../../modules/session';
import { createSyncMiddleware } from '../syncMiddleware';

// --- Helpers ---

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: 'interview-1',
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: { ego: { _uid: 'ego-1', [Symbol()]: {} }, nodes: [], edges: [] },

    ...overrides,
  } as SessionState;
}

const mutateSession = createAction<Partial<SessionState>>('TEST/MUTATE');

function createTestStore(
  middleware: ReturnType<typeof createSyncMiddleware>['middleware'],
  initialSession?: SessionState,
) {
  const session = initialSession ?? makeSession();

  return configureStore({
    reducer: {
      session: (state: SessionState | undefined, action: UnknownAction) => {
        const current = state ?? session;
        if (mutateSession.match(action)) {
          return { ...current, ...action.payload };
        }
        return current;
      },
    },
    preloadedState: { session },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }).concat(middleware),
  });
}

// --- Test suite ---

let onSyncMock: Mock;
let middleware: ReturnType<typeof createSyncMiddleware>['middleware'];
let flush: ReturnType<typeof createSyncMiddleware>['flush'];

// The middleware owns no timers: a change is offered to the host as it
// happens. `settle` therefore just drains microtasks — anything observed after
// it was provoked by the change, never by waiting.
const settle = () => act(async () => undefined);

// The batching host is the one thing in this file that does own a timer, and
// its window has to close because a test says so — never because a starved
// event loop let the real one fire mid-test. On real timers a loaded CI runner
// can stretch `settle` past a short window, so the trailing write lands before
// the burst is even asserted on and the burst reads as two writes. Fake the
// host's timer alone: `act` schedules through setImmediate/MessageChannel, so
// `settle` is untouched, and the shared afterEach puts real timers back.
function createBatchingHost(waitMs: number) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const write = vi.fn().mockResolvedValue(undefined);
  const batching = createSyncMiddleware({
    onSync: createDebouncedSyncHandler(write, { waitMs }),
  });
  return { write, batching, store: createTestStore(batching.middleware) };
}

beforeEach(() => {
  onSyncMock = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(vi.fn());

  ({ middleware, flush } = createSyncMiddleware({ onSync: onSyncMock }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('syncMiddleware', () => {
  it('offers every change to the host as it happens', async () => {
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();

    expect(onSyncMock).toHaveBeenCalledTimes(1);
    expect(onSyncMock).toHaveBeenCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:01.000Z' }),
      { immediate: false, unloading: false },
    );
  });

  it('does not sync when only promptIndex changes', async () => {
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ promptIndex: 5 }));
    await settle();

    expect(onSyncMock).not.toHaveBeenCalled();
  });

  it('offers a change even while an earlier write is unresolved', async () => {
    let resolveFirst!: () => void;
    onSyncMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Suppressing these until the first resolves would hide them from a host
    // that batches, which would then write a snapshot already stale by the time
    // its window closed. Deciding what to do with them is the host's job.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:03.000Z' }));
    await settle();

    expect(onSyncMock).toHaveBeenCalledTimes(3);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:03.000Z' }),
      { immediate: false, unloading: false },
    );

    resolveFirst();
    await settle();
  });

  it('lets a batching host write the newest state, not the first of its window', async () => {
    // The reason the engine does not coalesce. The host takes a burst — an
    // automatic-layout settle dispatches one update per node — and rate-limits
    // it to a single write, which must carry the last answer rather than the
    // one that happened to open the window.
    const windowMs = 20;
    const { write, store } = createBatchingHost(windowMs);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    expect(write).toHaveBeenCalledTimes(1);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:03.000Z' }));
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:04.000Z' }));
    await settle();

    // One write for the whole burst...
    expect(write).toHaveBeenCalledTimes(1);

    // ...and no flush here on purpose: a flush re-reads the store and would
    // carry the newest answer whether or not the host ever saw it. Close the
    // host's own window instead, so what it writes is only what it was told.
    await vi.advanceTimersByTimeAsync(windowMs);

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:04.000Z' }),
      { immediate: false, unloading: false },
    );
  });

  it('writes an answer reverted while an older write was on the wire', async () => {
    // Eligibility is measured against the last snapshot that LANDED, so an
    // answer edited and then changed back while the first write is in flight
    // reads as unchanged and is never offered. When that write lands it moves
    // the mark to the transient value, leaving the reverted one — the
    // participant's actual answer — differing from it with nothing scheduled.
    let resolveFirst!: () => void;
    onSyncMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const store = createTestStore(middleware);
    const durable = store.getState().session.lastUpdated;

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:09.000Z' }));
    await settle();
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    store.dispatch(mutateSession({ lastUpdated: durable }));
    await settle();

    resolveFirst();
    await settle();

    // Without the re-check the last write carries the transient value and the
    // store is left stale until some later action or flush.
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: durable }),
      { immediate: false, unloading: false },
    );
  });

  it('reads current state at sync time, not at dispatch time', async () => {
    let resolveFirst!: () => void;
    onSyncMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:09.000Z' }));
    resolveFirst();
    await settle();

    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:09.000Z' }),
      { immediate: false, unloading: false },
    );
  });

  it('does not sync when state is identical to the last synced state', async () => {
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();

    expect(onSyncMock).toHaveBeenCalledTimes(1);
  });

  it('resets state when a new store connects', async () => {
    const first = createTestStore(middleware);
    first.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    onSyncMock.mockClear();

    // A remount hands the middleware a different store; nothing from the old
    // one should be treated as already synced.
    const second = createTestStore(
      middleware,
      makeSession({ id: 'interview-2' }),
    );
    second.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:05.000Z' }));
    await settle();

    expect(onSyncMock).toHaveBeenCalledTimes(1);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-2',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:05.000Z' }),
      { immediate: false, unloading: false },
    );
  });

  it('does not retry a failed write in a loop while nothing changes', async () => {
    onSyncMock.mockRejectedValue(new Error('Sync failed'));
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    await settle();

    // One attempt. There is no timer in this layer to space retries out, so a
    // self-chasing retry would spin as fast as the microtask queue.
    expect(onSyncMock).toHaveBeenCalledTimes(1);
  });

  it('retries a failed snapshot on the next change', async () => {
    onSyncMock.mockRejectedValueOnce(new Error('Sync failed'));
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    await settle();

    // The failed write never advanced the high-water mark, so this carries both
    // answers rather than only the newest.
    expect(onSyncMock).toHaveBeenCalledTimes(2);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:02.000Z' }),
      { immediate: false, unloading: false },
    );
  });

  it('handles sync errors without breaking subsequent syncs', async () => {
    onSyncMock.mockRejectedValueOnce(new Error('Sync failed'));
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    await settle();

    expect(onSyncMock).toHaveBeenCalledTimes(2);
  });
});

describe('syncMiddleware flush', () => {
  it('tells the host the write cannot be deferred', async () => {
    const store = createTestStore(middleware);
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));

    await flush();

    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:01.000Z' }),
      { immediate: true, unloading: false },
    );
  });

  it('does not wait out a host that is holding changes back', async () => {
    // A real batching host whose window this test never closes, so a parked
    // write can only go out because the flush forced it. Awaiting the parked
    // write before signalling immediacy is exactly the mistake this guards: the
    // host only learns it must stop batching when it is told, so the flush has
    // to say so first — get that wrong and it waits on a window that never ends.
    const { write, batching, store } = createBatchingHost(60_000);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    expect(write).toHaveBeenCalledTimes(1);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    await settle();
    expect(write).toHaveBeenCalledTimes(1);

    await batching.flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:02.000Z' }),
      { immediate: true, unloading: false },
    );
  });

  it('keeps writing when an answer arrives during its own write', async () => {
    // A batching host whose window never closes here, so the only writes that
    // can happen are the ones the flush forces. That makes the last answer's
    // fate depend solely on whether the flush goes round again.
    const { write, batching, store } = createBatchingHost(60_000);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await settle();
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    await settle();

    // Hold the flush's write open so a newer answer has somewhere to land.
    let releaseWrite!: () => void;
    write.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseWrite = resolve;
        }),
    );

    let settled = false;
    const running = (async () => {
      await batching.flush();
      settled = true;
    })();
    await settle();

    // The participant answers again while the flush's write is on the wire.
    // The background path can only hand this to the host, which parks it
    // behind its window — so leaving after one pass would hand the caller a
    // "flushed" store still holding the newest answer.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:03.000Z' }));
    await settle();
    expect(settled).toBe(false);

    releaseWrite();
    await running;

    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:03.000Z' }),
      { immediate: true, unloading: false },
    );
  });

  it('gives up after a bounded number of passes when answers never stop', async () => {
    const store = createTestStore(middleware);
    let answers = 0;

    onSyncMock.mockImplementation(async () => {
      // Deferred a microtask so the dispatch lands while the write is on the
      // wire, the shape a real answer arriving mid-write has. The supply is
      // capped only so the background write chain — which correctly keeps
      // going while the session keeps moving — can end and let the test finish;
      // the cap is well above the flush bound under test.
      await Promise.resolve();
      if (answers >= 8) return;
      answers += 1;
      store.dispatch(
        mutateSession({ lastUpdated: `2026-01-01T00:00:0${answers}.000Z` }),
      );
    });

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:00.000Z' }));

    await expect(flush()).resolves.toBeUndefined();

    // Count only the flush's own writes — the background chain is correctly
    // still going, and it is the flush that must be bounded: a participant
    // answering continuously cannot be allowed to hold an interview exit open.
    const flushWrites = onSyncMock.mock.calls.filter(
      (call) => (call[2] as { immediate: boolean } | undefined)?.immediate,
    );
    expect(flushWrites.length).toBeLessThanOrEqual(3);
    expect(flushWrites.length).toBeGreaterThan(0);
  });

  it('offers a reverted answer when flushed, rather than reporting nothing to do', async () => {
    // The revert case again, this time on the flush path. The live session is
    // momentarily equal to what is stored, so a durability check alone reads as
    // "nothing to do" — but the write on the wire carries the value the
    // participant discarded. Exiting there hands control back on a promise that
    // persistence is correct, moments before it stops being. Getting the newer
    // snapshot onto the wire is this layer's job; landing them in order is the
    // host's, and the shipped handler queues them.
    let resolveFirst!: () => void;
    onSyncMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const store = createTestStore(middleware);
    const durable = store.getState().session.lastUpdated;

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:09.000Z' }));
    await settle();
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    store.dispatch(mutateSession({ lastUpdated: durable }));
    await settle();

    // The question is temporal, so the assertion has to be: AT THE MOMENT
    // flush resolves, has the live session been handed to the host? Answering
    // it afterwards proves nothing — the post-write re-check corrects this
    // eventually either way, but by then the caller has already been told it
    // was safe to exit.
    let offeredWhenFlushResolved = false;
    const flushed = flush().then(() => {
      offeredWhenFlushResolved = onSyncMock.mock.calls.some(
        (call) => (call[1] as { lastUpdated: string }).lastUpdated === durable,
      );
    });
    await settle();
    resolveFirst();
    await flushed;

    expect(offeredWhenFlushResolved).toBe(true);
  });

  it('resolves rather than rejecting when the final sync fails', async () => {
    onSyncMock.mockRejectedValue(new Error('Vault locked'));
    const store = createTestStore(middleware);
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));

    await expect(flush()).resolves.toBeUndefined();
    expect(onSyncMock).toHaveBeenCalled();
  });

  it('is a no-op when nothing has changed', async () => {
    createTestStore(middleware);

    await flush();

    expect(onSyncMock).not.toHaveBeenCalled();
  });
});
