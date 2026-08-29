import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { createDebouncedSyncHandler } from '../contract/debouncedSync';
import type { InterviewPayload, SyncHandler } from '../contract/types';
import Shell from '../Shell';
import { updateStageMetadata } from '../store/modules/session';

vi.mock('../hooks/useMediaQuery', () => ({ default: () => false }));

vi.mock('../interfaces', () => {
  const ObservedInterface = ({ stage }: { stage: { id: string } }) => (
    <div data-stage-interface={stage.id} />
  );

  return { default: () => ObservedInterface };
});

const payload = {
  session: {
    id: 'session-1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    network: {
      ego: {
        [entityPrimaryKeyProperty]: 'ego-1',
        [entityAttributesProperty]: {},
      },
      nodes: [],
      edges: [],
    },
  },
  protocol: {
    id: 'protocol-1',
    hash: 'protocol-hash',
    importedAt: '2026-01-01T00:00:00.000Z',
    name: 'Unmount-flush protocol',
    schemaVersion: 8,
    codebook: {
      ego: { variables: {} },
      node: {},
      edge: {},
    },
    assets: [],
    stages: [
      {
        id: 'only-stage',
        type: 'Information',
        label: 'Only stage',
        title: 'Only stage',
        items: [],
      },
    ],
  },
} satisfies InterviewPayload;

// A host that batches, which is what the engine's flushes exist to interrupt.
// Using the real helper rather than a hand-rolled stand-in keeps this honest
// about how a batching host actually behaves.
function makeBatchingHost() {
  const write = vi.fn().mockResolvedValue(undefined);
  return { write, onSync: createDebouncedSyncHandler(write, { waitMs: 3000 }) };
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

function renderShell(onSync: SyncHandler) {
  return render(
    <Shell
      payload={payload}
      onSync={onSync}
      onFinish={() => Promise.resolve()}
      onRequestAsset={() => Promise.resolve('')}
      analytics={{ installationId: 'test', hostApp: 'test' }}
      disableAnalytics
      hideNavigation
      flags={{ isE2E: true }}
    />,
  );
}

function liveStore() {
  const store = window.__interviewStore;
  if (!store) throw new Error('store not exposed');
  return store;
}

const answer = (value: boolean) =>
  updateStageMetadata({ currentStep: 0, metadata: [[0, 'a', 'b', value]] });

describe('Shell sync flushes', () => {
  beforeEach(() => {
    // Fake only the host's batching timer, so it can never elapse by itself:
    // any write observed without advancing time was provoked by a flush.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    setVisibility('visible');
  });

  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('writes what a batching host is holding when the document is hidden', async () => {
    const { write, onSync } = makeBatchingHost();
    renderShell(onSync);
    const store = liveStore();

    // First answer goes straight out on the host's leading edge; let it settle
    // so nothing is on the wire.
    act(() => {
      store.dispatch(answer(true));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(write).toHaveBeenCalledTimes(1);

    // Second answer lands inside the host's window, so it is being held.
    act(() => {
      store.dispatch(answer(false));
    });
    expect(write).toHaveBeenCalledTimes(1);

    // The device is put to sleep seconds after that answer. Script may never
    // run again, so the held answer has to go now — without this the batching
    // timer resumes only when the tab does, minutes later, into a host that may
    // no longer be able to write at all.
    setVisibility('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({ stageMetadata: { 0: [[0, 'a', 'b', false]] } }),
      { immediate: true },
    );
  });

  it('leaves a held answer alone while the document is still visible', async () => {
    const { write, onSync } = makeBatchingHost();
    renderShell(onSync);
    const store = liveStore();

    act(() => {
      store.dispatch(answer(true));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      store.dispatch(answer(false));
    });
    const callsBefore = write.mock.calls.length;

    // A visibilitychange that reports the document still visible is the return
    // half of the pair; batching is the host's choice and must survive it.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(write.mock.calls.length).toBe(callsBefore);
  });

  it('hands an unwritten answer to onSync when the Shell unmounts', async () => {
    const { write, onSync } = makeBatchingHost();
    const view = renderShell(onSync);
    const store = liveStore();

    act(() => {
      store.dispatch(answer(true));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      store.dispatch(answer(false));
    });
    const callsBeforeUnmount = write.mock.calls.length;

    view.unmount();
    await act(async () => {
      // Settle microtasks only. The host's batching window is still 3s away,
      // so a write observed here was provoked by the unmount, not the timer.
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(write.mock.calls.length).toBe(callsBeforeUnmount + 1);
    expect(write).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({ stageMetadata: { 0: [[0, 'a', 'b', false]] } }),
      { immediate: true },
    );
  });
});
