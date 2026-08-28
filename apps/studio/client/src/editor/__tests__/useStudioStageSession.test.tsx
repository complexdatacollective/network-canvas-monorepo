// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { rpcClient } from '../../lib/api.ts';
import { useStudioStageSession } from '../useStudioStageSession.ts';

const STAGE_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT = {
  protocol: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    draftId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    name: 'Session proof',
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  },
  revision: { sequence: '2', hash: 'revision-2' },
  sections: {
    settings: {},
    stageOrder: { stages: [STAGE_ID] },
    [`stage:${STAGE_ID}`]: {
      id: STAGE_ID,
      type: 'Information',
      label: 'Welcome',
      title: 'Welcome',
      items: [],
    },
  },
};

vi.mock('../../lib/api.ts', () => ({
  rpcClient: {
    protocols: {
      acquireSection: vi.fn(),
      renewSection: vi.fn(),
      releaseSection: vi.fn(),
      commitSection: vi.fn(),
      draft: vi.fn(),
    },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function renderSession(draft = DRAFT) {
  return renderHook(
    ({ currentDraft }) =>
      useStudioStageSession({
        teamId: 'team-a',
        protocolId: DRAFT.protocol.id,
        draftId: DRAFT.protocol.draftId,
        clientId: 'client-a',
        stageId: STAGE_ID,
        draft: currentDraft,
        onCommitted: vi.fn(),
      }),
    { initialProps: { currentDraft: draft } },
  );
}

beforeEach(() => {
  vi.mocked(rpcClient.protocols.acquireSection).mockReset();
  vi.mocked(rpcClient.protocols.acquireSection).mockResolvedValue({
    mode: 'editable',
    leaseEpoch: '1',
    nextClientSequence: '1',
  });
  vi.mocked(rpcClient.protocols.renewSection).mockReset();
  vi.mocked(rpcClient.protocols.renewSection).mockResolvedValue({
    renewed: true,
  });
  vi.mocked(rpcClient.protocols.releaseSection).mockReset();
  vi.mocked(rpcClient.protocols.releaseSection).mockResolvedValue(undefined);
  vi.mocked(rpcClient.protocols.commitSection).mockReset();
  vi.mocked(rpcClient.protocols.commitSection).mockResolvedValue({
    sequence: '3',
    hash: 'revision-3',
  });
  vi.mocked(rpcClient.protocols.draft).mockReset();
  vi.mocked(rpcClient.protocols.draft).mockResolvedValue(DRAFT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useStudioStageSession', () => {
  it('keeps the same leased session when a committed draft refresh arrives', async () => {
    const view = renderSession();
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    if (view.result.current.status !== 'ready') throw new Error('not ready');
    const originalSession = view.result.current.session;

    view.rerender({
      currentDraft: {
        ...DRAFT,
        revision: { sequence: '3', hash: 'revision-3' },
      },
    });

    expect(view.result.current.status).toBe('ready');
    if (view.result.current.status !== 'ready') throw new Error('not ready');
    expect(view.result.current.session).toBe(originalSession);
    expect(rpcClient.protocols.acquireSection).toHaveBeenCalledTimes(1);
  });

  it('reports a failed commit to the save caller and fences editing', async () => {
    vi.mocked(rpcClient.protocols.commitSection).mockRejectedValueOnce(
      new Error('commit failed'),
    );
    const view = renderSession();
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    if (view.result.current.status !== 'ready') throw new Error('not ready');

    await act(async () => {
      if (view.result.current.status !== 'ready') throw new Error('not ready');
      view.result.current.session.dispatch([
        { op: 'set', key: 'label', value: 'Changed' },
      ]);
      if (view.result.current.status !== 'ready') throw new Error('not ready');
      await expect(view.result.current.save()).rejects.toThrow('commit failed');
    });

    expect(view.result.current.status).toBe('ready');
    if (view.result.current.status !== 'ready') throw new Error('not ready');
    expect(view.result.current.session.getSnapshot().access.mode).toBe(
      'readOnly',
    );
  });

  it('continues client sequencing when an existing lease is reacquired', async () => {
    vi.mocked(rpcClient.protocols.acquireSection).mockResolvedValueOnce({
      mode: 'editable',
      leaseEpoch: '4',
      nextClientSequence: '7',
    });
    const view = renderSession();
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    if (view.result.current.status !== 'ready') throw new Error('not ready');

    act(() => {
      if (view.result.current.status !== 'ready') throw new Error('not ready');
      view.result.current.session.dispatch([
        { op: 'set', key: 'label', value: 'Changed' },
      ]);
    });

    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledWith(
        expect.objectContaining({
          leaseEpoch: '4',
          clientSequence: '7',
        }),
      ),
    );
  });

  it('drains a pending commit before releasing its lease', async () => {
    const commit = deferred<{ sequence: string; hash: string }>();
    vi.mocked(rpcClient.protocols.commitSection).mockReturnValueOnce(
      commit.promise,
    );
    const view = renderSession();
    await waitFor(() => expect(view.result.current.status).toBe('ready'));
    if (view.result.current.status !== 'ready') throw new Error('not ready');

    act(() => {
      if (view.result.current.status !== 'ready') throw new Error('not ready');
      view.result.current.session.dispatch([
        { op: 'set', key: 'label', value: 'Changed' },
      ]);
    });
    await waitFor(() =>
      expect(rpcClient.protocols.commitSection).toHaveBeenCalledTimes(1),
    );

    view.unmount();
    expect(rpcClient.protocols.releaseSection).not.toHaveBeenCalled();

    commit.resolve({ sequence: '3', hash: 'revision-3' });
    await waitFor(() =>
      expect(rpcClient.protocols.releaseSection).toHaveBeenCalledWith(
        expect.objectContaining({ leaseEpoch: '1' }),
      ),
    );
  });

  it('promotes a spectator after the editing lease becomes available', async () => {
    vi.useFakeTimers();
    vi.mocked(rpcClient.protocols.draft).mockResolvedValueOnce({
      ...DRAFT,
      revision: { sequence: '3', hash: 'revision-3' },
      sections: {
        ...DRAFT.sections,
        [`stage:${STAGE_ID}`]: {
          ...DRAFT.sections[`stage:${STAGE_ID}`],
          label: 'Changed by collaborator',
          title: 'Changed by collaborator',
        },
      },
    });
    vi.mocked(rpcClient.protocols.acquireSection)
      .mockResolvedValueOnce({ mode: 'readOnly' })
      .mockResolvedValueOnce({
        mode: 'editable',
        leaseEpoch: '2',
        nextClientSequence: '1',
      });
    const view = renderSession();
    await act(async () => {
      await Promise.resolve();
    });
    expect(view.result.current.status).toBe('ready');
    if (view.result.current.status !== 'ready') throw new Error('not ready');
    expect(view.result.current.session.getSnapshot().access.mode).toBe(
      'readOnly',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(view.result.current.status).toBe('ready');
    if (view.result.current.status !== 'ready') throw new Error('not ready');
    expect(view.result.current.session.getSnapshot().access.mode).toBe(
      'editable',
    );
    expect(
      view.result.current.session.getSnapshot().editedSection.fields,
    ).toMatchObject({
      label: 'Changed by collaborator',
      title: 'Changed by collaborator',
    });
    expect(rpcClient.protocols.draft).toHaveBeenCalledTimes(1);
  });

  it('releases an editable lease that resolves after unmount', async () => {
    const acquisition = deferred<{
      mode: 'editable';
      leaseEpoch: string;
      nextClientSequence: string;
    }>();
    vi.mocked(rpcClient.protocols.acquireSection).mockReturnValueOnce(
      acquisition.promise,
    );
    const view = renderSession();
    view.unmount();

    acquisition.resolve({
      mode: 'editable',
      leaseEpoch: '7',
      nextClientSequence: '1',
    });

    await waitFor(() =>
      expect(rpcClient.protocols.releaseSection).toHaveBeenCalledWith(
        expect.objectContaining({ leaseEpoch: '7' }),
      ),
    );
  });
});
