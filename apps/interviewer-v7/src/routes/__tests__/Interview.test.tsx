import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigateMock = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/interview/s1', navigateMock],
}));

const requireFreshUnlockMock = vi.fn();
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => ({ requireFreshUnlock: requireFreshUnlockMock }),
}));

const getSettingsMock = vi.fn();
const getSessionMock = vi.fn();
const getProtocolByHashMock = vi.fn();
const markSessionFinishedMock = vi.fn();
vi.mock('~/lib/db/api', () => ({
  getSettings: (...a: unknown[]) => getSettingsMock(...a),
  getSession: (...a: unknown[]) => getSessionMock(...a),
  getProtocolByHash: (...a: unknown[]) => getProtocolByHashMock(...a),
  updateSession: vi.fn(),
  updateSettings: vi.fn(),
  markSessionFinished: (...a: unknown[]) => markSessionFinishedMock(...a),
}));

vi.mock('~/lib/assets/assetResolver', () => ({
  buildResolvedAssets: vi.fn(async () => ({})),
  makeAssetResolver: vi.fn(() => async () => ''),
}));
vi.mock('~/lib/platform/installationId', () => ({
  getInstallationId: () => 'test-install',
}));
vi.mock('~/lib/platform/platform', () => ({
  hostAppName: 'web',
  isElectron: false,
  isCapacitor: false,
}));

const { shellMock } = vi.hoisted(() => ({ shellMock: vi.fn() }));
vi.mock('@codaco/interview', () => ({
  Shell: (props: Record<string, unknown>) => {
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

function lastShellProps(): Record<string, unknown> {
  return shellMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;
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

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
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

    await invoke(lastShellProps().onExit as () => void);

    expect(navigateMock).not.toHaveBeenCalledWith('/');
  });

  it('navigates home when the exit gate passes', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await invoke(lastShellProps().onExit as () => void);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/'));
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
      await (lastShellProps().onFinish as (id: string) => Promise<void>)('s1');
    });

    expect(markSessionFinishedMock).toHaveBeenCalledWith('s1');
    expect(await screen.findByText('Interview complete')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it('renders the completion screen for an already-finished session', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({ finishedAt: '2026-01-02T00:00:00.000Z' }),
    );

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByText('Interview complete')).toBeInTheDocument();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });
});
