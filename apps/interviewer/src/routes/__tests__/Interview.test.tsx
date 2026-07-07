import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionPayload } from '@codaco/interview';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/interview/s1', navigateMock],
}));

const requireFreshUnlockMock = vi.fn();
const getAuthorizedInterviewIdMock = vi.fn<() => string | null>();
const setAuthorizedInterviewIdMock = vi.fn();
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({
    requireFreshUnlock: requireFreshUnlockMock,
    getAuthorizedInterviewId: getAuthorizedInterviewIdMock,
    setAuthorizedInterviewId: setAuthorizedInterviewIdMock,
  }),
}));

const getSettingsMock = vi.fn();
const getSessionMock = vi.fn();
const getProtocolByHashMock = vi.fn();
const markSessionFinishedMock = vi.fn();
const updateSessionMock = vi.fn();
vi.mock('~/lib/db/api', () => ({
  getSettings: (...a: unknown[]) => getSettingsMock(...a),
  getSession: (...a: unknown[]) => getSessionMock(...a),
  getProtocolByHash: (...a: unknown[]) => getProtocolByHashMock(...a),
  updateSession: (...a: unknown[]) => updateSessionMock(...a),
  updateSettings: vi.fn(),
  markSessionFinished: (...a: unknown[]) => markSessionFinishedMock(...a),
}));

vi.mock('~/lib/assets/assetResolver', () => ({
  buildResolvedAssets: vi.fn(async () => ({})),
  makeAssetResolver: vi.fn(() => async () => ''),
}));
// The history mechanics are covered in useHistoryBackGuard's own test; here the
// gated exit just runs its navigation callback. The returned exit function must
// be a stable reference (the real hook uses useCallback), or consumers that put
// it in effect deps re-run every render.
vi.mock('~/lib/pwa/useHistoryBackGuard', () => {
  const exit = (goHome: () => void) => goHome();
  return { useHistoryBackGuard: () => exit };
});
vi.mock('~/lib/installationId', () => ({
  getInstallationId: () => 'test-install',
}));

type CapturedShellProps = {
  onExit: () => void;
  onFinish: (id: string) => Promise<void>;
  onSync: (id: string, session: SessionPayload) => Promise<void>;
};

const { shellMock } = vi.hoisted(() => ({
  shellMock: vi.fn<(props: CapturedShellProps) => void>(),
}));
vi.mock('@codaco/interview', () => ({
  Shell: (props: CapturedShellProps) => {
    shellMock(props);
    return <div data-testid="shell-mounted" />;
  },
}));

import { InterviewRoute } from '../Interview';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    protocolHash: 'h1',
    protocolName: 'P',
    caseId: 'c1',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastUpdatedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
    exportedAt: null,
    currentStep: 0,
    network: { nodes: [], edges: [] },
    ...overrides,
  };
}

function makeProtocol() {
  return {
    id: 'p1',
    hash: 'h1',
    importedAt: '2026-01-01T00:00:00.000Z',
    protocol: { stages: [], codebook: { node: {}, edge: {}, ego: {} } },
  };
}

function lastShellProps(): CapturedShellProps {
  const props = shellMock.mock.calls.at(-1)?.[0];
  if (!props) throw new Error('Shell was never rendered');
  return props;
}

function makeSyncPayload(
  overrides: Partial<SessionPayload> = {},
): SessionPayload {
  return {
    id: 's1',
    startTime: '2026-01-01T00:00:00.000Z',
    finishTime: null,
    exportTime: null,
    lastUpdated: '2026-01-01T00:00:00.000Z',
    network: { nodes: [], edges: [], ego: { _uid: 'ego-1', attributes: {} } },
    ...overrides,
  };
}

async function invoke(fn: () => unknown) {
  await act(async () => {
    void fn();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(makeSession());
  getProtocolByHashMock.mockResolvedValue(makeProtocol());
  requireFreshUnlockMock.mockResolvedValue({ ok: true });
  getAuthorizedInterviewIdMock.mockReturnValue(null);
});

describe('InterviewRoute enter gate', () => {
  it('navigates home when the enter gate is cancelled', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: true,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });

    render(<InterviewRoute sessionId="s1" />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('mounts the Shell without prompting when the enter gate is off', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(requireFreshUnlockMock).not.toHaveBeenCalled();
    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith('s1');
  });

  it('skips the enter gate when entry is already authorized (lock/unlock remount)', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: true,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
    getAuthorizedInterviewIdMock.mockReturnValue('s1');

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(requireFreshUnlockMock).not.toHaveBeenCalled();
  });

  it('does not authorize entry when unmounted mid-load', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
    let resolveSession!: (session: unknown) => void;
    getSessionMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );

    const { unmount } = render(<InterviewRoute sessionId="s1" />);
    // Let getSettings resolve so the loader parks at the getSession await.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    unmount();
    await act(async () => {
      resolveSession(makeSession());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(setAuthorizedInterviewIdMock).not.toHaveBeenCalledWith('s1');
  });
});

describe('InterviewRoute exit gate', () => {
  beforeEach(() => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: false,
    });
  });

  it('stays in the interview when the exit gate is cancelled', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });

    await invoke(lastShellProps().onExit);

    expect(navigateMock).not.toHaveBeenCalledWith('/', { replace: true });
  });

  it('navigates home and clears authorization when the exit gate passes', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await invoke(lastShellProps().onExit);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith(null);
  });
});

describe('InterviewRoute finish flow', () => {
  beforeEach(() => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
  });

  it('shows the completion screen after finishing', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await act(async () => {
      await lastShellProps().onFinish('s1');
    });

    expect(markSessionFinishedMock).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('Interview complete')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('never writes finishedAt from a sync', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    updateSessionMock.mockClear();

    await act(async () => {
      await lastShellProps().onSync('s1', makeSyncPayload());
    });

    const patch = updateSessionMock.mock.calls.at(-1)?.[1];
    expect(patch).not.toHaveProperty('finishedAt');
  });

  it('does not un-finish when a trailing sync lands after finish', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    const { onFinish, onSync } = lastShellProps();

    await act(async () => {
      await onFinish('s1');
    });
    await screen.findByText('Interview complete');

    updateSessionMock.mockClear();
    // A debounced sync fired after finish still carries finishTime: null
    // (the engine never sets it for an in-progress session).
    await act(async () => {
      await onSync('s1', makeSyncPayload({ finishTime: null }));
    });

    for (const call of updateSessionMock.mock.calls) {
      expect(call[1]).not.toHaveProperty('finishedAt');
    }
  });

  it('renders the completion screen for an already-finished session', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({ finishedAt: '2026-01-02T00:00:00.000Z' }),
    );

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByText('Interview complete')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('clears authorization when returning home from the missing screen', async () => {
    getProtocolByHashMock.mockResolvedValue(null);

    render(<InterviewRoute sessionId="s1" />);
    const button = await screen.findByRole('button', { name: /return home/i });

    setAuthorizedInterviewIdMock.mockClear();
    await invoke(() => button.click());

    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith(null);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
  });

  it('applies the exit gate from the completion screen', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: false,
    });
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await act(async () => {
      await lastShellProps().onFinish('s1');
    });
    await screen.findByText('Interview complete');

    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });
    await invoke(() => screen.getByRole('button', { name: /exit/i }).click());

    expect(navigateMock).not.toHaveBeenCalledWith('/', { replace: true });
  });
});
