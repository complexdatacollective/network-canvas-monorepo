import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { InterviewPayload, SessionPayload } from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';

const navigateMock = vi.fn();
const useSearchMock = vi.fn(() => '');
const useRouteMock = vi.fn<() => [boolean, { sessionId?: string } | null]>(
  () => [true, { sessionId: 's1' }],
);
vi.mock('wouter', () => ({
  useLocation: () => ['/interview/s1', navigateMock],
  useSearch: () => useSearchMock(),
  useRoute: () => useRouteMock(),
}));

const requireFreshUnlockMock = vi.fn();
const getAuthorizedInterviewIdMock = vi.fn<() => string | null>();
const setAuthorizedInterviewIdMock = vi.fn();
// The real provider hands out a context value whose function identities can
// change across provider re-renders. Tests that simulate such a re-render swap
// in a fresh set of wrappers via refreshStepUpContextIdentities().
const makeStepUpContext = () => ({
  requireFreshUnlock: () =>
    requireFreshUnlockMock() as Promise<{ ok: boolean }>,
  getAuthorizedInterviewId: () => getAuthorizedInterviewIdMock(),
  setAuthorizedInterviewId: (id: string | null) =>
    setAuthorizedInterviewIdMock(id),
});
let stepUpContext = makeStepUpContext();
function refreshStepUpContextIdentities() {
  stepUpContext = makeStepUpContext();
}
vi.mock('~/lib/auth/StepUpAuthProvider', () => ({
  useStepUpAuth: () => stepUpContext,
}));

const getSettingsMock = vi.fn();
const getSessionMock = vi.fn();
const getProtocolByHashMock = vi.fn();
const markSessionFinishedMock = vi.fn();
const updateSessionMock = vi.fn();
const updateSettingsMock = vi.fn();
vi.mock('~/lib/db/api', () => ({
  getSettings: (...a: unknown[]) => getSettingsMock(...a),
  getSession: (...a: unknown[]) => getSessionMock(...a),
  getProtocolByHash: (...a: unknown[]) => getProtocolByHashMock(...a),
  updateSession: (...a: unknown[]) => updateSessionMock(...a),
  updateSettings: (...a: unknown[]) => updateSettingsMock(...a),
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
  currentStep: number;
  disableAnalytics: boolean;
  finishConfirmationDescription: string;
  initialStageOverrideIndex?: number;
  payload: InterviewPayload;
  onExit: () => void;
  onFinish: (id: string) => Promise<void>;
  onSync: (id: string, session: SessionPayload) => Promise<void>;
  onStepChange: (
    step: number,
    meta: { progress: number; totalSteps: number },
  ) => void;
  registerSyncFlush: (flush: () => Promise<void>) => () => void;
  reviewMode: boolean;
};

const { shellMock } = vi.hoisted(() => ({
  shellMock: vi.fn<(props: CapturedShellProps) => void>(),
}));
vi.mock('@codaco/interview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codaco/interview')>();
  return {
    ...actual,
    Shell: (props: CapturedShellProps) => {
      shellMock(props);
      return <div data-testid="shell-mounted" />;
    },
  };
});

import { registerPreLockFlush } from '~/lib/auth/preLockFlush';

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
    network: {
      nodes: [],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    },
    ...overrides,
  };
}

function makeProtocol() {
  return {
    id: 'p1',
    hash: 'h1',
    schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    importedAt: '2026-01-01T00:00:00.000Z',
    protocol: {
      stages: [
        { id: 'stage-1' },
        { id: 'stage-2' },
        { id: 'stage-3' },
        { id: 'stage-4' },
      ],
      codebook: { node: {}, edge: {}, ego: {} },
    },
  };
}

function makeProtocolWithNoActiveAuthoredStage() {
  const base = makeProtocol();
  return {
    ...base,
    protocol: {
      ...base.protocol,
      stages: [
        {
          id: 'stage-1',
          skipLogic: {
            action: 'SKIP',
            filter: { join: 'AND', rules: [] },
            destination: { type: 'finish' },
          },
        },
        { id: 'stage-2' },
        { id: 'stage-3' },
        { id: 'stage-4' },
      ],
    },
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
  useSearchMock.mockReturnValue('');
  useRouteMock.mockReturnValue([true, { sessionId: 's1' }]);
  refreshStepUpContextIdentities();
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

  it('lends the Shell autosave flush to the vault lock', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });

    render(<InterviewRoute sessionId="s1" />);
    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();

    // Without this the interview's pending answers are only written when the
    // Shell unmounts — which, on an idle lock, is after the encryption key
    // they need has already been cleared.
    expect(lastShellProps().registerSyncFlush).toBe(registerPreLockFlush);
  });

  it('hydrates the Shell payload with the canonical persisted network', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
    const canonicalNetwork = {
      nodes: [
        {
          _uid: 'n1',
          type: 'person',
          attributes: { falseValue: false, zeroValue: 0, emptyValue: '' },
        },
      ],
      edges: [],
      ego: { _uid: 'ego-1', attributes: {} },
    };
    getSessionMock.mockResolvedValue(
      makeSession({ network: canonicalNetwork }),
    );

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(lastShellProps().payload.session.network).toEqual(canonicalNetwork);
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

describe('InterviewRoute exit transition', () => {
  // App.tsx's AnimatePresence page transition keeps this route mounted (with
  // live context subscriptions) while its exit fade plays after navigation
  // away. A load-effect re-run in that window used to re-fire the enter gate —
  // the exit had just cleared the entry authorization, so a phantom
  // "Confirm your identity" prompt (with destructive recovery armed, since the
  // live path is Home) opened over Home and nothing ever resolved it.
  it('does not re-run the enter gate or re-authorize while exiting', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: true,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
    // Entry was authorized on Home (NewSessionForm) before navigating here.
    getAuthorizedInterviewIdMock.mockReturnValue('s1');

    const { rerender } = render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    expect(requireFreshUnlockMock).not.toHaveBeenCalled();

    await invoke(lastShellProps().onExit);
    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith(null);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });

    // The exit-fade window: the live location is Home, the authorization is
    // cleared, and the provider re-render handed out fresh context function
    // identities — which is what re-ran the load effect.
    getAuthorizedInterviewIdMock.mockReturnValue(null);
    useRouteMock.mockReturnValue([false, null]);
    refreshStepUpContextIdentities();
    setAuthorizedInterviewIdMock.mockClear();
    rerender(<InterviewRoute sessionId="s1" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // No phantom step-up prompt over Home…
    expect(requireFreshUnlockMock).not.toHaveBeenCalled();
    // …and the entry authorization the exit just cleared stays cleared.
    expect(setAuthorizedInterviewIdMock).not.toHaveBeenCalledWith('s1');
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

  it('opens an already-finished session in read-only review mode', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({
        currentStep: 4,
        finishedAt: '2026-01-02T00:00:00.000Z',
      }),
    );

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(screen.getByText('Read-only review')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Changes made while reviewing this interview will not be saved.',
      ),
    ).toBeInTheDocument();
    expect(lastShellProps().currentStep).toBe(3);
    expect(lastShellProps().disableAnalytics).toBe(true);
    expect(lastShellProps().reviewMode).toBe(true);
    expect(lastShellProps().finishConfirmationDescription).toBe(
      'Finishing ends this interview. A researcher can mark it unfinished later if changes are needed.',
    );
    expect(screen.queryByText('Interview complete')).not.toBeInTheDocument();
  });

  it('preserves the finish step for an ordinary unfinished session', async () => {
    getProtocolByHashMock.mockResolvedValue(
      makeProtocolWithNoActiveAuthoredStage(),
    );
    getSessionMock.mockResolvedValue(makeSession({ currentStep: 4 }));

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(lastShellProps().currentStep).toBe(4);
    expect(lastShellProps().initialStageOverrideIndex).toBeUndefined();
  });

  it('forces the route-controlling stage after marking a session unfinished', async () => {
    getProtocolByHashMock.mockResolvedValue(
      makeProtocolWithNoActiveAuthoredStage(),
    );
    getSessionMock.mockResolvedValue(
      makeSession({ currentStep: 0, resumeStageOverrideIndex: 0 }),
    );

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(lastShellProps().currentStep).toBe(0);
    expect(lastShellProps().initialStageOverrideIndex).toBe(0);
  });

  it('clears the mark-unfinished stage override after navigation', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({ currentStep: 0, resumeStageOverrideIndex: 0 }),
    );

    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    updateSessionMock.mockClear();

    act(() => {
      lastShellProps().onStepChange(1, { progress: 50, totalSteps: 4 });
    });

    expect(updateSessionMock).toHaveBeenCalledWith('s1', {
      currentStep: 1,
      progress: 50,
      resumeStageOverrideIndex: undefined,
    });
  });

  it('honours explicit review intent when the stored session is unfinished', async () => {
    useSearchMock.mockReturnValue('mode=review');

    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    const { onFinish, onStepChange, onSync } = lastShellProps();

    await act(async () => {
      await onSync('s1', makeSyncPayload());
      onStepChange(2, { progress: 75, totalSteps: 4 });
      await onFinish('s1');
    });

    expect(lastShellProps().reviewMode).toBe(true);
    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(markSessionFinishedMock).not.toHaveBeenCalled();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it('suppresses every session write while reviewing a finished session', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({ finishedAt: '2026-01-02T00:00:00.000Z' }),
    );

    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    const { onFinish, onStepChange, onSync } = lastShellProps();

    await act(async () => {
      await onSync('s1', makeSyncPayload());
      onStepChange(2, { progress: 75, totalSteps: 4 });
      await onFinish('s1');
    });

    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(markSessionFinishedMock).not.toHaveBeenCalled();
    expect(updateSettingsMock).not.toHaveBeenCalled();
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

  it('refuses to run a session whose protocol is below the runtime schema version', async () => {
    getProtocolByHashMock.mockResolvedValue({
      ...makeProtocol(),
      schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION - 1,
    });

    render(<InterviewRoute sessionId="s1" />);

    expect(
      await screen.findByRole('heading', { name: /interview unavailable/i }),
    ).toBeInTheDocument();
    expect(shellMock).not.toHaveBeenCalled();
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
