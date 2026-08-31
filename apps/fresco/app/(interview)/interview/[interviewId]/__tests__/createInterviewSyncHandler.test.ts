import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionPayload, SyncOptions } from '@codaco/interview/contract';

import { createInterviewSyncHandler } from '../createInterviewSyncHandler';

const ORDINARY: SyncOptions = { immediate: false, unloading: false };
const UNLOADING: SyncOptions = { immediate: true, unloading: true };

/**
 * Watch a write's outcome from the moment it is issued. Attaching later would
 * let a rejection surface as an unhandled one and fail the whole run.
 */
function settle(write: Promise<void>) {
  return write.then(
    () => 'fulfilled' as const,
    () => 'rejected' as const,
  );
}

function sessionWith(name: string): SessionPayload {
  return {
    id: 'interview-1',
    startTime: '2026-08-12T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-08-12T00:00:00.000Z',
    network: {
      nodes: [{ _uid: 'node-1', type: 'person', attributes: { name } }],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    },
  };
}

type SyncBody = { network: SessionPayload['network']; syncRevision?: number };

/**
 * The endpoint's own rule, so these tests measure what the participant's
 * answers end up as rather than what the handler happened to send. A body that
 * carries no revision, or revisions in the wrong order, is written straight
 * through here exactly as the real route would write it.
 */
function makeServer(initialRevision = 0) {
  const state = {
    revision: initialRevision,
    network: sessionWith('nothing yet').network,
    writes: 0,
  };

  const apply = (body: SyncBody) => {
    if (
      body.syncRevision !== undefined &&
      body.syncRevision <= state.revision
    ) {
      return { success: true, applied: false, syncRevision: state.revision };
    }
    state.writes += 1;
    state.network = body.network;
    if (body.syncRevision !== undefined) state.revision = body.syncRevision;
    return { success: true, applied: true, syncRevision: state.revision };
  };

  return { state, apply };
}

/** A fetch stub whose responses are released by the test, one at a time. */
function makeFetch(apply: (body: SyncBody) => unknown) {
  const releases: (() => void)[] = [];
  const bodies: SyncBody[] = [];

  const fetchMock = vi.fn(
    (_url: string, init: { body: string; signal?: AbortSignal }) => {
      const body = JSON.parse(init.body) as SyncBody;
      bodies.push(body);

      return new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
        releases.push(() => {
          const result = apply(body);
          resolve({
            ok: true,
            json: () => Promise.resolve(result),
          });
        });
      });
    },
  );

  return {
    fetchMock,
    bodies,
    /** Settle the nth request that was issued (0-indexed). */
    release: (index: number) => {
      const release = releases[index];
      if (!release) throw new Error(`No request at index ${index}`);
      release();
    },
  };
}

describe('createInterviewSyncHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the newest answers when an unloading write overtakes the one before it', async () => {
    // The bug this guards: an `unloading` write is issued rather than queued,
    // so it can be on the wire beside an ordinary write and the two can finish
    // in either order. Aborting the ordinary request client-side does not stop
    // a handler the server has already started, so the older snapshot could be
    // committed last and discard the participant's most recent answers.
    const { state, apply } = makeServer();
    const { fetchMock, bodies, release } = makeFetch(apply);
    vi.stubGlobal('fetch', fetchMock);

    const onSync = createInterviewSyncHandler({
      interviewId: 'interview-1',
      initialSyncRevision: 0,
      getCurrentStep: () => 2,
    });

    // An ordinary write goes out and stays on the wire. Track its outcome now:
    // the write it is about to be superseded by aborts it, and a rejection
    // nobody is watching yet fails the run as an unhandled one.
    const ordinary = settle(
      onSync('interview-1', sessionWith('older'), ORDINARY),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The tab is hidden. This write does not wait for the one in front of it.
    const unloading = settle(
      onSync('interview-1', sessionWith('newer'), UNLOADING),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The newer one is handled first, then the older one it overtook.
    release(1);
    await vi.advanceTimersByTimeAsync(0);
    release(0);

    // Numbered in the order they were issued, whatever order they land in.
    expect(bodies.map((body) => body.syncRevision)).toEqual([1, 2]);
    expect(state.network).toEqual(sessionWith('newer').network);
    // Only the newer snapshot was ever committed.
    expect(state.writes).toBe(1);

    await expect(unloading).resolves.toBe('fulfilled');
    // The abort is what the superseded write reports; the engine logs it and
    // re-offers the live state. Ordering is not what that rejection buys — the
    // route discards the write regardless of whether it is cancelled in time.
    await expect(ordinary).resolves.toBe('rejected');
  });

  it('numbers writes upwards from the revision the row already holds', async () => {
    // A reloaded tab starting again at one would have every write it made
    // treated as older than what is stored, and discarded.
    const { state, apply } = makeServer(41);
    const { fetchMock, bodies, release } = makeFetch(apply);
    vi.stubGlobal('fetch', fetchMock);

    const onSync = createInterviewSyncHandler({
      interviewId: 'interview-1',
      initialSyncRevision: 41,
      getCurrentStep: () => 0,
    });

    const write = onSync('interview-1', sessionWith('resumed'), ORDINARY);
    await vi.advanceTimersByTimeAsync(0);
    release(0);
    await write;

    expect(bodies[0]?.syncRevision).toBe(42);
    expect(state.network).toEqual(sessionWith('resumed').network);
  });

  it('resumes from the stored revision when another tab is ahead', async () => {
    // A second tab seeds its counter when it loads, so the tab that has been
    // writing since is ahead of it. Without resuming from what the row reports,
    // every write this tab ever makes would be discarded — a guard against one
    // stale write turned into permanent, silent data loss.
    const { state, apply } = makeServer();
    const { fetchMock, bodies, release } = makeFetch(apply);
    vi.stubGlobal('fetch', fetchMock);

    const onSync = createInterviewSyncHandler({
      interviewId: 'interview-1',
      initialSyncRevision: 0,
      getCurrentStep: () => 0,
    });

    // The other tab has written several times since this one loaded.
    state.revision = 20;

    const first = onSync('interview-1', sessionWith('mine'), ORDINARY);
    await vi.advanceTimersByTimeAsync(0);
    release(0);
    await first;

    expect(bodies[0]?.syncRevision).toBe(1);
    expect(state.network).not.toEqual(sessionWith('mine').network);

    // The next write must clear the number the row reported back.
    const second = onSync('interview-1', sessionWith('mine again'), UNLOADING);
    await vi.advanceTimersByTimeAsync(0);
    release(1);
    await second;

    expect(bodies[1]?.syncRevision).toBe(21);
    expect(state.network).toEqual(sessionWith('mine again').network);
  });

  it('batches ordinary changes and writes the newest of them', async () => {
    const { apply } = makeServer();
    const { fetchMock, bodies, release } = makeFetch(apply);
    vi.stubGlobal('fetch', fetchMock);

    const onSync = createInterviewSyncHandler({
      interviewId: 'interview-1',
      initialSyncRevision: 0,
      getCurrentStep: () => 0,
    });

    const leading = onSync('interview-1', sessionWith('first'), ORDINARY);
    await vi.advanceTimersByTimeAsync(0);
    release(0);
    await leading;

    // Inside the rate-limit window these are held, not written one for one.
    void onSync('interview-1', sessionWith('second'), ORDINARY);
    void onSync('interview-1', sessionWith('third'), ORDINARY);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(bodies[1]?.network).toEqual(sessionWith('third').network);
    expect(bodies[1]?.syncRevision).toBe(2);
  });

  it('refuses a sync for an interview it does not belong to', async () => {
    const { apply } = makeServer();
    const { fetchMock } = makeFetch(apply);
    vi.stubGlobal('fetch', fetchMock);

    const onSync = createInterviewSyncHandler({
      interviewId: 'interview-1',
      initialSyncRevision: 0,
      getCurrentStep: () => 0,
    });

    await expect(
      onSync('interview-2', sessionWith('stray'), ORDINARY),
    ).rejects.toThrow(/interview-2.+interview-1/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
