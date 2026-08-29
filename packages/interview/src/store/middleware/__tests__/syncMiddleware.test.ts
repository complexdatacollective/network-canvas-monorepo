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

beforeEach(() => {
  onSyncMock = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(vi.fn());

  ({ middleware, flush } = createSyncMiddleware({ onSync: onSyncMock }));
});

afterEach(() => {
  vi.restoreAllMocks();
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
    const write = vi.fn().mockResolvedValue(undefined);
    const batching = createSyncMiddleware({
      onSync: createDebouncedSyncHandler(write, { waitMs: 20 }),
    });
    const store = createTestStore(batching.middleware);

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
    // carry the newest answer whether or not the host ever saw it. Let the
    // host's own window close, so what it writes is only what it was told.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:04.000Z' }),
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
    // A real batching host, on a window long enough that waiting it out would
    // hang the test. Awaiting the parked write before signalling immediacy is
    // exactly the mistake this guards: the host only learns it must stop
    // batching when it is told, so the flush has to say so first.
    const write = vi.fn().mockResolvedValue(undefined);
    const batching = createSyncMiddleware({
      onSync: createDebouncedSyncHandler(write, { waitMs: 60_000 }),
    });
    const store = createTestStore(batching.middleware);

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
    // A batching host on a long window, so the only writes that can happen are
    // the ones the flush forces. That makes the last answer's fate depend
    // solely on whether the flush goes round again.
    const write = vi.fn().mockResolvedValue(undefined);
    const batching = createSyncMiddleware({
      onSync: createDebouncedSyncHandler(write, { waitMs: 60_000 }),
    });
    const store = createTestStore(batching.middleware);

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
    // The background path can only hand this to the host, which parks it for
    // another 60s — so leaving after one pass would hand the caller a
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
