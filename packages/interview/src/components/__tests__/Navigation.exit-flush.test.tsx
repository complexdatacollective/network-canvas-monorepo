import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { createDebouncedSyncHandler } from '../../contract/debouncedSync';
import type { InterviewPayload } from '../../contract/types';
import Shell from '../../Shell';
import { updateStageMetadata } from '../../store/modules/session';

vi.mock('../../hooks/useMediaQuery', () => ({ default: () => false }));

vi.mock('../../interfaces', () => {
  const ObservedInterface = ({ stage }: { stage: { id: string } }) => (
    <div data-stage-interface={stage.id} />
  );

  return { default: () => ObservedInterface };
});

// Base UI otherwise waits for CSS animations jsdom never runs, leaving the
// settings menu and confirm dialog stuck mid-transition.
globalThis.BASE_UI_ANIMATIONS_DISABLED = true;

// The dropdown menu's ScrollArea needs a ResizeObserver jsdom doesn't provide
// (mirrors StagesMenu.test.tsx).
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
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
    name: 'Exit-flush protocol',
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

describe('Navigation exit flush', () => {
  it('invokes onExit only after the pending sync — including a write already on the wire — has flushed', async () => {
    // First write stays on the wire until released; later ones resolve
    // immediately. This reproduces the worst-case exit: a write in flight AND
    // a newer snapshot still waiting behind it.
    //
    // Wrapped in the real batching helper because ordering writes is the
    // host's job now — the engine offers changes and never runs the host's
    // writes for it. Both shipped hosts wrap their handler exactly like this.
    let releaseFirstSync!: () => void;
    const firstSync = new Promise<void>((resolve) => {
      releaseFirstSync = resolve;
    });
    const write = vi
      .fn<(id: string, session: unknown) => Promise<void>>()
      .mockImplementationOnce(() => firstSync)
      .mockResolvedValue(undefined);
    const onSync = createDebouncedSyncHandler(write, { waitMs: 3000 });
    const onExit = vi.fn();

    render(
      <Shell
        payload={payload}
        onSync={onSync}
        onFinish={() => Promise.resolve()}
        onRequestAsset={() => Promise.resolve('')}
        analytics={{ installationId: 'test', hostApp: 'test' }}
        disableAnalytics
        onExit={onExit}
        flags={{ isE2E: true }}
      />,
    );

    const store = window.__interviewStore;
    if (!store) throw new Error('store not exposed');

    // Change A: leading-edge sync fires and stays in flight (held above).
    act(() => {
      store.dispatch(
        updateStageMetadata({
          currentStep: 0,
          metadata: [[0, 'a', 'b', true]],
        }),
      );
    });
    // The host is handed the change on a microtask, not synchronously.
    await act(async () => undefined);
    expect(write).toHaveBeenCalledTimes(1);
    // Change B: held by the host, behind the write already on the wire.
    act(() => {
      store.dispatch(
        updateStageMetadata({
          currentStep: 0,
          metadata: [[0, 'a', 'b', false]],
        }),
      );
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId('settings-button'));
    await user.click(await screen.findByTestId('exit-button'));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Exit interview' }),
    );

    // The exit is confirmed and the final snapshot has been marked as one that
    // cannot be deferred, but the host queues it behind the write already on
    // the wire. Control must stay here until that finishes.
    await act(async () => undefined);
    expect(write).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();

    releaseFirstSync();

    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    // Change B was written, as an undeferrable write, before control returned.
    expect(write).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({
        stageMetadata: { 0: [[0, 'a', 'b', false]] },
      }),
      { immediate: true, unloading: false },
    );
    expect(write.mock.invocationCallOrder.at(-1)).toBeLessThan(
      onExit.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
