import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import type { InterviewPayload } from '../contract/types';
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

describe('Shell unmount flush', () => {
  beforeEach(() => {
    // Fake only the debounce's own timer so the autosave middleware's 3s
    // trailing edge can never elapse by itself — any sync observed after
    // unmount must have come from the teardown flush.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hands a pending debounced autosave to onSync when the Shell unmounts', async () => {
    const onSync = vi.fn().mockResolvedValue(undefined);

    const view = render(
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

    const store = window.__interviewStore;
    expect(store).toBeDefined();
    if (!store) throw new Error('store not exposed');

    // First change fires the debounce's leading edge immediately; the second,
    // inside the still-open window, is held for the 3s trailing edge — the
    // state an interview exit leaves behind when the participant answers and
    // leaves within the window.
    act(() => {
      store.dispatch(
        updateStageMetadata({
          currentStep: 0,
          metadata: [[0, 'a', 'b', true]],
        }),
      );
    });
    // Let the leading-edge write resolve so no sync is in flight at unmount.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      store.dispatch(
        updateStageMetadata({
          currentStep: 0,
          metadata: [[0, 'a', 'b', false]],
        }),
      );
    });
    const callsBeforeUnmount = onSync.mock.calls.length;

    view.unmount();

    // No timer advance: the pending write must have been flushed by the
    // unmount itself, carrying the trailing (post-second-dispatch) state.
    expect(onSync.mock.calls.length).toBe(callsBeforeUnmount + 1);
    expect(onSync).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({
        stageMetadata: { 0: [[0, 'a', 'b', false]] },
      }),
    );
  });
});
