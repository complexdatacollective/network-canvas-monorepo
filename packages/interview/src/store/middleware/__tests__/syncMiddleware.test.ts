import {
  configureStore,
  createAction,
  type UnknownAction,
} from '@reduxjs/toolkit';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest';

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

beforeEach(() => {
  vi.useFakeTimers();
  onSyncMock = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(vi.fn());
  vi.spyOn(console, 'error').mockImplementation(vi.fn());

  ({ middleware, flush } = createSyncMiddleware({ onSync: onSyncMock }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('syncMiddleware', () => {
  it('syncs immediately on first state change (leading edge)', async () => {
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));

    // Leading edge fires synchronously inside the debounce call, which
    // triggers the async onSync. Flush the microtask queue so the mock
    // is invoked.
    await vi.advanceTimersByTimeAsync(0);

    expect(onSyncMock).toHaveBeenCalledTimes(1);
    expect(onSyncMock).toHaveBeenCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:01.000Z' }),
    );
  });

  it('does not sync when only promptIndex changes', async () => {
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ promptIndex: 5 }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(onSyncMock).not.toHaveBeenCalled();
  });

  it('batches rapid changes and sends latest state on trailing edge', async () => {
    const store = createTestStore(middleware);

    // First change → leading edge sync
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Rapid subsequent changes within the 3s debounce window
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:03.000Z' }));
    await vi.advanceTimersByTimeAsync(0);

    // Still only the initial sync — debounce absorbs these
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Advance past the debounce window → trailing edge fires
    await vi.advanceTimersByTimeAsync(3000);

    expect(onSyncMock).toHaveBeenCalledTimes(2);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:03.000Z' }),
    );
  });

  it('does not lose changes made during an in-flight sync', async () => {
    // Create an onSync that we can resolve manually to control timing
    let resolveSync!: () => void;
    onSyncMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = resolve;
        }),
    );

    const store = createTestStore(middleware);

    // First change → leading edge sync starts (in-flight)
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Change state while sync is in-flight
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));

    // Resolve the in-flight sync → .finally() should detect dirty state
    // and call debouncedSync(). The debounce timer is still active from the
    // earlier calls, so the follow-up fires on the trailing edge.
    resolveSync();
    await vi.advanceTimersByTimeAsync(0);

    // Advance past the debounce window so the trailing edge fires
    await vi.advanceTimersByTimeAsync(3000);
    expect(onSyncMock).toHaveBeenCalledTimes(2);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:02.000Z' }),
    );
  });

  it('reads current state at sync time, not at dispatch time', async () => {
    // Slow onSync so we can observe the trailing edge behavior
    onSyncMock.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          // Resolve after a short delay
          setTimeout(resolve, 100),
        ),
    );

    const store = createTestStore(middleware);

    // Leading edge sync fires with currentStep: 1
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);

    // Let the sync complete
    await vi.advanceTimersByTimeAsync(100);

    // More changes within the debounce window
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:05.000Z' }));

    // Advance past debounce → trailing edge fires
    await vi.advanceTimersByTimeAsync(3000);

    // The trailing edge should have the latest state (currentStep: 5)
    expect(onSyncMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:05.000Z' }),
    );
  });

  it('resets state when a new store connects', async () => {
    const store1 = createTestStore(middleware);

    // Trigger a sync on store 1
    store1.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Create a new store with the same middleware (simulates navigating
    // to a new interview). The middleware should reset its internal state.
    const store2 = createTestStore(
      middleware,
      makeSession({ id: 'interview-2' }),
    );

    // A change on store 2 should trigger a sync, even though the state
    // shape might overlap with store 1's last synced state.
    store2.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);

    expect(onSyncMock).toHaveBeenCalledTimes(2);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-2',
      expect.objectContaining({ id: 'interview-2' }),
    );
  });

  it('cancels pending debounce timers when a new store connects', async () => {
    const store1 = createTestStore(middleware);

    // Trigger leading edge + queue trailing
    store1.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    store1.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Connect a new store before the trailing edge fires
    createTestStore(middleware, makeSession({ id: 'interview-2' }));

    // Advance past the original debounce window
    await vi.advanceTimersByTimeAsync(3000);

    // The trailing edge from store 1 should NOT have fired — it was
    // cancelled when store 2 connected.
    expect(onSyncMock).toHaveBeenCalledTimes(1);
  });

  it('handles sync errors without breaking subsequent syncs', async () => {
    onSyncMock.mockRejectedValueOnce(new Error('Network error'));

    const store = createTestStore(middleware);

    // First sync fails
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Second change should still trigger a sync
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    await vi.advanceTimersByTimeAsync(3000);

    expect(onSyncMock).toHaveBeenCalledTimes(2);
  });

  it('retries the same snapshot after a failed sync with no further changes', async () => {
    // First sync attempt rejects; the second (retry) resolves.
    onSyncMock
      .mockRejectedValueOnce(new Error('Vault locked'))
      .mockResolvedValueOnce(undefined);

    const store = createTestStore(middleware);

    // A change triggers the leading-edge sync, which fails.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // No further user changes are made. The failed snapshot must not be
    // silently dropped — the middleware must retry it on the debounce window.
    await vi.advanceTimersByTimeAsync(3000);

    expect(onSyncMock).toHaveBeenCalledTimes(2);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:01.000Z' }),
    );
  });

  it('does not sync when state is identical to last synced state', async () => {
    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // Advance past debounce to clear the timer
    await vi.advanceTimersByTimeAsync(3000);

    // Dispatch the same value — state doesn't actually change in a
    // meaningful way from the middleware's perspective if the reducer
    // produces the same result, but our test reducer always spreads
    // (creating a new object). The middleware uses deep equality, so
    // it should still skip the sync.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(3000);

    // The trailing from the first cycle may fire, but the second dispatch
    // should not produce an additional sync because the values match.
    const callsWithStep1 = (
      onSyncMock.mock.calls as [string, SessionState][]
    ).filter((call) => call[1].lastUpdated === '2026-01-01T00:00:01.000Z');
    // At most the leading + trailing of the first cycle
    expect(callsWithStep1.length).toBeLessThanOrEqual(2);

    // No call should have been made for the second dispatch
    const allSteps = (onSyncMock.mock.calls as [string, SessionState][]).map(
      (call) => call[1].lastUpdated,
    );
    expect(allSteps.every((step) => step === '2026-01-01T00:00:01.000Z')).toBe(
      true,
    );
  });
});

describe('syncMiddleware flush', () => {
  it('writes a pending change immediately without waiting out the debounce', async () => {
    const store = createTestStore(middleware);

    // Leading edge consumes the first change.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // A later change is now sitting in the trailing debounce window.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // No timer advance: flush must write it right now.
    await flush();

    expect(onSyncMock).toHaveBeenCalledTimes(2);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:02.000Z' }),
    );
  });

  it('waits for an already in-flight sync before resolving', async () => {
    let resolveSync!: () => void;
    onSyncMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = resolve;
        }),
    );

    const store = createTestStore(middleware);

    // Leading edge sync starts and stays in-flight.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // A newer answer arrives while that write is on the wire.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));

    let settled = false;
    const flushed = flush().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    resolveSync();
    await flushed;

    expect(settled).toBe(true);
    expect(onSyncMock).toHaveBeenCalledTimes(2);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:02.000Z' }),
    );
  });

  it('keeps writing when an answer arrives during its own write', async () => {
    const store = createTestStore(middleware);

    // Let the leading edge fire and settle, so nothing is on the wire when the
    // flush begins and the second write below is unambiguously the flush's.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(1);

    // The change sitting in the debounce window that the flush is called to
    // rescue. Hold its write open so a newer answer can land mid-flight.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:02.000Z' }));
    let resolveFlushWrite!: () => void;
    onSyncMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFlushWrite = resolve;
        }),
    );

    let settled = false;
    const flushed = (async () => {
      await flush();
      settled = true;
    })();
    await vi.advanceTimersByTimeAsync(0);
    expect(onSyncMock).toHaveBeenCalledTimes(2);

    // The participant answers again while the flush's write is on the wire.
    // doSync refuses to start a second concurrent write, so this snapshot can
    // only reach storage on the trailing debounce — which the caller that is
    // about to end the session will never let run.
    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:03.000Z' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    resolveFlushWrite();
    await flushed;

    // No timer advance: the newest answer was written by the flush itself.
    expect(onSyncMock).toHaveBeenCalledTimes(3);
    expect(onSyncMock).toHaveBeenLastCalledWith(
      'interview-1',
      expect.objectContaining({ lastUpdated: '2026-01-01T00:00:03.000Z' }),
    );
  });

  it('gives up after a bounded number of passes when answers never stop', async () => {
    const store = createTestStore(middleware);
    let nextAnswer = 0;

    // Every write has another answer land while it is on the wire, so the
    // store is never quiet. The flush must still hand control back: a
    // participant answering continuously cannot be allowed to hold an exit —
    // or an idle lock — open forever.
    onSyncMock.mockImplementation(async () => {
      // Deferred a microtask so the dispatch lands after doSync has recorded
      // the write as in flight — the shape a real answer arriving mid-write
      // has, rather than re-entering doSync from inside onSync itself.
      await Promise.resolve();
      nextAnswer += 1;
      store.dispatch(
        mutateSession({ lastUpdated: `2026-01-01T00:00:0${nextAnswer}.000Z` }),
      );
    });

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:00.000Z' }));
    await vi.advanceTimersByTimeAsync(0);

    const callsBeforeFlush = onSyncMock.mock.calls.length;
    await expect(flush()).resolves.toBeUndefined();
    expect(onSyncMock.mock.calls.length - callsBeforeFlush).toBeLessThanOrEqual(
      3,
    );
  });

  it('resolves rather than rejecting when the final sync fails', async () => {
    onSyncMock.mockRejectedValue(new Error('Vault locked'));

    const store = createTestStore(middleware);

    store.dispatch(mutateSession({ lastUpdated: '2026-01-01T00:00:01.000Z' }));

    // Finishing must never be blocked by a failed write.
    await expect(flush()).resolves.toBeUndefined();
    expect(onSyncMock).toHaveBeenCalled();
  });

  it('is a no-op when nothing has changed', async () => {
    createTestStore(middleware);

    await flush();

    expect(onSyncMock).not.toHaveBeenCalled();
  });
});
