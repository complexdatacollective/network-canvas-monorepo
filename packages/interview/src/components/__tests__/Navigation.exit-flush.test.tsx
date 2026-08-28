import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

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
    // First sync stays on the wire until released; later syncs resolve
    // immediately. This reproduces the worst-case exit: a write in flight AND
    // a newer snapshot still queued behind it.
    let releaseFirstSync!: () => void;
    const firstSync = new Promise<void>((resolve) => {
      releaseFirstSync = resolve;
    });
    const onSync = vi
      .fn<(id: string, session: unknown) => Promise<void>>()
      .mockImplementationOnce(() => firstSync)
      .mockResolvedValue(undefined);
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
    expect(onSync).toHaveBeenCalledTimes(1);
    // Change B: queued behind the in-flight write on the trailing debounce.
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

    // The exit is confirmed, but the first write is still on the wire — the
    // host must not be handed control yet, and the queued snapshot must not
    // have been submitted (doSync never runs two writes concurrently).
    await waitFor(() => expect(onSync).toHaveBeenCalledTimes(1));
    expect(onExit).not.toHaveBeenCalled();

    releaseFirstSync();

    await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1));
    // The final snapshot (change B) was written before control returned.
    expect(onSync).toHaveBeenCalledTimes(2);
    expect(onSync).toHaveBeenLastCalledWith(
      'session-1',
      expect.objectContaining({
        stageMetadata: { 0: [[0, 'a', 'b', false]] },
      }),
    );
    expect(onSync.mock.invocationCallOrder[1]).toBeLessThan(
      onExit.mock.invocationCallOrder[0] ?? 0,
    );
  });
});
