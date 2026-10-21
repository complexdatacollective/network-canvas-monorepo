import { act, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import type { InterviewPayload, SessionPayload } from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { InterviewerI18nProvider } from '~/i18n/InterviewerI18nProvider';
import { interviewerProductionLocales } from '~/i18n/locales';
import { LOCALE_PREFERENCE_KEY } from '~/i18n/preference';
import { interviewerCatalogSource } from '~/locales/catalogs';

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
const takeEntryUnlockGraceMock = vi.fn((_sessionId: string) => false);
const endEntryUnlockGraceMock = vi.fn();
vi.mock('~/lib/auth/entryUnlockGrace', () => ({
  takeEntryUnlockGrace: (sessionId: string) =>
    takeEntryUnlockGraceMock(sessionId),
  endEntryUnlockGrace: () => endEntryUnlockGraceMock(),
}));

// Interviewer 8 inside Interviewer 9 (a /v8/ build) returns to Interviewer 9
// wherever the root app goes Home.
const subpath = vi.hoisted(() => ({
  isSubpath: false,
  returnToInterviewer9: vi.fn(() => {
    historyGuard.log.push('returned to Interviewer 9');
  }),
}));
vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return subpath.isSubpath;
  },
}));
vi.mock('~/lib/interviewer9Navigation', () => ({
  returnToInterviewer9: () => subpath.returnToInterviewer9(),
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
// Each exit is logged, so a case can see that it went through the guard (which
// pops the pinned entry first) rather than around it.
const historyGuard = vi.hoisted(() => ({ log: [] as string[] }));
vi.mock('~/lib/pwa/useHistoryBackGuard', () => {
  const exit = (goHome: () => void) => {
    historyGuard.log.push('guard popped');
    goHome();
  };
  return { useHistoryBackGuard: () => exit };
});
vi.mock('~/lib/installationId', () => ({
  getInstallationId: () => 'test-install',
}));

// The app-level analytics context as the route sees it. `client` lags
// `enabled`: the provider flips the opt-in state first and resolves its
// posthog-js client afterwards, and the client stays null for good in builds
// with analytics disabled or when the load fails.
const { analyticsContext, fakeAnalyticsClient } = vi.hoisted(() => {
  const client = {
    capture: vi.fn(),
    captureException: vi.fn(),
    register: vi.fn(),
  };
  const context: {
    enabled: boolean;
    client: typeof client | null;
    captureException: typeof client.captureException;
  } = {
    enabled: false,
    client: null,
    captureException: vi.fn(),
  };
  return { analyticsContext: context, fakeAnalyticsClient: client };
});
vi.mock('~/lib/analytics/AnalyticsProvider', () => ({
  useAnalytics: () => analyticsContext,
}));

type CapturedShellProps = {
  currentStep: number;
  disableAnalytics: boolean;
  posthogClient?: unknown;
  finishConfirmationDescription: ReactNode;
  requestedLocale: string;
  localePreference: string | null;
  onLocaleChange: (locale: string | null) => void;
  initialStageOverrideIndex?: number;
  payload: InterviewPayload;
  onExit: () => void;
  onFinish: (id: string) => Promise<void>;
  onSync: (
    id: string,
    session: SessionPayload,
    options: { immediate: boolean; unloading: boolean },
  ) => Promise<void>;
  onStepChange: (
    step: number,
    meta: { progress: number; totalSteps: number },
  ) => void;
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
      // A queued confirmation retains its original node. Deliberately give
      // the package a different locale so this tests the host subscription,
      // not accidental inheritance of the host catalog through Shell.
      const [queuedDescription] = useState(props.finishConfirmationDescription);
      return (
        <AppI18nProvider
          locale="en"
          locales={interviewerProductionLocales}
          manageDocument={false}
        >
          <div data-testid="shell-mounted">{queuedDescription}</div>
        </AppI18nProvider>
      );
    },
  };
});

import { InterviewRoute } from '../Interview';

// The locale cases switch between these synchronously, as a device that has
// already loaded them would.
await Promise.all(
  ['es', 'en-GB'].map((locale) => interviewerCatalogSource.load(locale)),
);

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
  subpath.isSubpath = false;
  historyGuard.log = [];
  getSessionMock.mockResolvedValue(makeSession());
  getProtocolByHashMock.mockResolvedValue(makeProtocol());
  requireFreshUnlockMock.mockResolvedValue({ ok: true });
  getAuthorizedInterviewIdMock.mockReturnValue(null);
  takeEntryUnlockGraceMock.mockReturnValue(false);
  useSearchMock.mockReturnValue('');
  useRouteMock.mockReturnValue([true, { sessionId: 's1' }]);
  refreshStepUpContextIdentities();
});

describe('InterviewRoute enter gate', () => {
  it('passes the negotiated device locale to Shell and persists menu choices without reloading the interview', async () => {
    const languages = vi
      .spyOn(navigator, 'languages', 'get')
      .mockReturnValue(['en-GB']);
    localStorage.removeItem(LOCALE_PREFERENCE_KEY);
    getSettingsMock.mockResolvedValue({ requireUnlockOnEnter: false });
    try {
      render(
        <InterviewerI18nProvider>
          <InterviewRoute sessionId="s1" />
        </InterviewerI18nProvider>,
      );
      const shell = await screen.findByTestId('shell-mounted');
      expect(lastShellProps().requestedLocale).toBe('en-GB');
      expect(lastShellProps().localePreference).toBeNull();
      const originalPayload = lastShellProps().payload;
      expect(shell).toHaveTextContent('Finishing ends this interview.');
      const reads = getSessionMock.mock.calls.length;

      act(() => lastShellProps().onLocaleChange('es'));
      expect(lastShellProps().requestedLocale).toBe('es');
      expect(lastShellProps().localePreference).toBe('es');
      expect(shell).toHaveTextContent(
        'Al finalizar, se cierra esta entrevista.',
      );
      expect(shell).toHaveTextContent(
        'la persona responsable de la investigación puede volver a marcarla como sin finalizar',
      );
      expect(document.documentElement).toHaveAttribute('lang', 'es');
      expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBe('es');
      expect(lastShellProps().payload).toBe(originalPayload);
      expect(getSessionMock).toHaveBeenCalledTimes(reads);
      expect(updateSessionMock).not.toHaveBeenCalled();
      expect(requireFreshUnlockMock).not.toHaveBeenCalled();

      act(() => lastShellProps().onLocaleChange(null));
      expect(lastShellProps().requestedLocale).toBe('en-GB');
      expect(lastShellProps().localePreference).toBeNull();
      expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBeNull();
      expect(document.documentElement).toHaveAttribute('lang', 'en-GB');
      expect(shell).toHaveTextContent('Finishing ends this interview.');
      expect(lastShellProps().payload).toBe(originalPayload);
      expect(getSessionMock).toHaveBeenCalledTimes(reads);
    } finally {
      languages.mockRestore();
      localStorage.removeItem(LOCALE_PREFERENCE_KEY);
    }
  });

  it('initializes the menu with the saved explicit preference and can return directly to Automatic', async () => {
    const languages = vi
      .spyOn(navigator, 'languages', 'get')
      .mockReturnValue(['en-GB']);
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'es');
    getSettingsMock.mockResolvedValue({ requireUnlockOnEnter: false });
    try {
      render(
        <InterviewerI18nProvider>
          <InterviewRoute sessionId="s1" />
        </InterviewerI18nProvider>,
      );
      const shell = await screen.findByTestId('shell-mounted');
      expect(lastShellProps().requestedLocale).toBe('es');
      expect(lastShellProps().localePreference).toBe('es');
      expect(shell).toHaveTextContent(
        'Al finalizar, se cierra esta entrevista.',
      );
      const payload = lastShellProps().payload;
      const reads = getSessionMock.mock.calls.length;
      act(() => lastShellProps().onLocaleChange(null));
      expect(lastShellProps().requestedLocale).toBe('en-GB');
      expect(lastShellProps().localePreference).toBeNull();
      expect(shell).toHaveTextContent('Finishing ends this interview.');
      expect(localStorage.getItem(LOCALE_PREFERENCE_KEY)).toBeNull();
      expect(lastShellProps().payload).toBe(payload);
      expect(getSessionMock).toHaveBeenCalledTimes(reads);
      expect(updateSessionMock).not.toHaveBeenCalled();
      expect(requireFreshUnlockMock).not.toHaveBeenCalled();
    } finally {
      languages.mockRestore();
      localStorage.removeItem(LOCALE_PREFERENCE_KEY);
    }
  });

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

  it('skips the enter gate while a recent unlock stands in for it', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: true,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
    takeEntryUnlockGraceMock.mockReturnValue(true);

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(requireFreshUnlockMock).not.toHaveBeenCalled();
    expect(takeEntryUnlockGraceMock).toHaveBeenCalledWith('s1');
    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith('s1');
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
    // Whoever enters next unlocks as usual.
    expect(endEntryUnlockGraceMock).toHaveBeenCalledTimes(1);
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

    // `immediate` so the host's batching window does not defer the write past
    // the assertion; what is being checked is the patch, not the timing.
    await act(async () => {
      await lastShellProps().onSync('s1', makeSyncPayload(), {
        immediate: true,
        unloading: false,
      });
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
    // A sync landing after finish still carries finishTime: null (the engine
    // never sets it for an in-progress session).
    await act(async () => {
      await onSync('s1', makeSyncPayload({ finishTime: null }), {
        immediate: true,
        unloading: false,
      });
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
    expect(screen.getByTestId('shell-mounted')).toHaveTextContent(
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
      await onSync('s1', makeSyncPayload(), {
        immediate: true,
        unloading: false,
      });
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
      await onSync('s1', makeSyncPayload(), {
        immediate: true,
        unloading: false,
      });
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

  it('refuses to open a session whose stored data cannot be read, and reports it', async () => {
    const cause = new Error('stored network failed to parse');
    getSessionMock.mockRejectedValue(cause);

    render(<InterviewRoute sessionId="s1" />);

    expect(
      await screen.findByRole('heading', {
        name: /interview could not be opened/i,
      }),
    ).toBeInTheDocument();
    expect(shellMock).not.toHaveBeenCalled();
    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(updateSettingsMock).not.toHaveBeenCalled();
    expect(analyticsContext.captureException).toHaveBeenCalledWith(cause, {
      feature: 'interview-load',
    });
  });

  it('clears authorization when returning home from an unreadable session', async () => {
    // Fails after entry was authorized, so the stale id must be cleared.
    getProtocolByHashMock.mockRejectedValue(new Error('protocol unreadable'));

    render(<InterviewRoute sessionId="s1" />);
    const button = await screen.findByRole('button', { name: /return home/i });
    expect(
      screen.getByRole('heading', { name: /interview could not be opened/i }),
    ).toBeInTheDocument();

    setAuthorizedInterviewIdMock.mockClear();
    await invoke(() => button.click());

    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith(null);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
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

describe('InterviewRoute session change', () => {
  beforeEach(() => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
  });

  it('unmounts the previous interview while the next one loads, and fails closed if it cannot be read', async () => {
    let rejectNextSession!: (cause: unknown) => void;
    getSessionMock.mockImplementation((id: string) =>
      id === 's1'
        ? Promise.resolve(makeSession())
        : new Promise((_resolve, reject) => {
            rejectNextSession = reject;
          }),
    );

    const { rerender } = render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    shellMock.mockClear();
    updateSessionMock.mockClear();

    useRouteMock.mockReturnValue([true, { sessionId: 's2' }]);
    rerender(<InterviewRoute sessionId="s2" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // A Shell left mounted here would be handed handlers bound to s2, so its
    // next step change would write s1's progress into s2.
    act(() => {
      shellMock.mock.calls
        .at(-1)?.[0]
        .onStepChange(1, { progress: 50, totalSteps: 4 });
    });
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
    expect(shellMock).not.toHaveBeenCalled();
    expect(updateSessionMock).not.toHaveBeenCalled();

    await act(async () => {
      rejectNextSession(new Error('stored network failed to parse'));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      await screen.findByRole('heading', {
        name: /interview could not be opened/i,
      }),
    ).toBeInTheDocument();
    expect(shellMock).not.toHaveBeenCalled();
  });
});

describe('InterviewRoute analytics wiring', () => {
  beforeEach(() => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: false,
      requireUnlockOnExport: false,
    });
  });

  afterEach(() => {
    analyticsContext.enabled = false;
    analyticsContext.client = null;
  });

  // The Shell's contract for "analytics on, no client" is to start its own
  // posthog-js instance from the default entrypoint, which the app never
  // bundles deliberately: it carries the remote script loader the CSP forbids,
  // is not opted out by default, and knows nothing of the app's super
  // properties. The Shell must therefore stay off until the app's client is
  // attached, however long that takes.
  it('keeps Shell analytics off while opted in but the client has not resolved', async () => {
    analyticsContext.enabled = true;
    analyticsContext.client = null;

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(lastShellProps().posthogClient).toBeUndefined();
    expect(lastShellProps().disableAnalytics).toBe(true);
  });

  it('enables Shell analytics only with the app client attached', async () => {
    analyticsContext.enabled = true;
    analyticsContext.client = fakeAnalyticsClient;

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(lastShellProps().posthogClient).toBe(fakeAnalyticsClient);
    expect(lastShellProps().disableAnalytics).toBe(false);
  });

  it('keeps Shell analytics off after an opt-out even though the client stays loaded', async () => {
    analyticsContext.enabled = false;
    analyticsContext.client = fakeAnalyticsClient;

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    expect(lastShellProps().disableAnalytics).toBe(true);
  });
});

describe('InterviewRoute in Interviewer 8 inside Interviewer 9', () => {
  const ungated = {
    requireUnlockOnEnter: false,
    requireUnlockOnExit: false,
    requireUnlockOnExport: false,
  };

  beforeEach(() => {
    subpath.isSubpath = true;
    getSettingsMock.mockResolvedValue(ungated);
  });

  const expectReturnedToInterviewer9 = async () => {
    await waitFor(() =>
      expect(subpath.returnToInterviewer9).toHaveBeenCalledTimes(1),
    );
    expect(navigateMock).not.toHaveBeenCalled();
    // Not through the route's history guard: the close pops the guard entry
    // itself, within a bounded wait (interviewer9Navigation.ts).
    expect(historyGuard.log).toEqual(['returned to Interviewer 9']);
  };

  it('returns to Interviewer 9 from the exit button', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await invoke(lastShellProps().onExit);

    await expectReturnedToInterviewer9();
    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith(null);
    expect(endEntryUnlockGraceMock).toHaveBeenCalledTimes(1);
  });

  it('returns to Interviewer 9 from the completion screen', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    await act(async () => {
      await lastShellProps().onFinish('s1');
    });

    await invoke(() => screen.getByTestId('interview-complete-exit').click());

    await expectReturnedToInterviewer9();
  });

  it('stays in the interview while the exit unlock is declined', async () => {
    getSettingsMock.mockResolvedValue({
      ...ungated,
      requireUnlockOnExit: true,
    });
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });

    await invoke(lastShellProps().onExit);

    expect(subpath.returnToInterviewer9).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell-mounted')).toBeInTheDocument();
  });

  it('returns to Interviewer 9 when the enter unlock is declined', async () => {
    getSettingsMock.mockResolvedValue({
      ...ungated,
      requireUnlockOnEnter: true,
    });
    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });

    render(<InterviewRoute sessionId="s1" />);

    await expectReturnedToInterviewer9();
    expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
  });

  it.each([
    ['no such session', () => getSessionMock.mockResolvedValue(undefined)],
    [
      'no such protocol',
      () => getProtocolByHashMock.mockResolvedValue(undefined),
    ],
    [
      'a schema 9 protocol',
      () =>
        getProtocolByHashMock.mockResolvedValue({
          ...makeProtocol(),
          schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION + 1,
        }),
    ],
    [
      'an older schema’s protocol',
      () =>
        getProtocolByHashMock.mockResolvedValue({
          ...makeProtocol(),
          schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION - 1,
        }),
    ],
  ])(
    'returns to Interviewer 9 at once for %s, without a screen of its own',
    async (_, arrange) => {
      arrange();
      render(<InterviewRoute sessionId="s1" />);

      await expectReturnedToInterviewer9();
      expect(setAuthorizedInterviewIdMock).toHaveBeenLastCalledWith(null);
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(screen.queryByTestId('shell-mounted')).not.toBeInTheDocument();
    },
  );

  it('returns to Interviewer 9 at once for an interview whose data cannot be read, and reports it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new Error('unreadable');
    getSessionMock.mockRejectedValue(cause);
    render(<InterviewRoute sessionId="s1" />);

    await expectReturnedToInterviewer9();
    expect(setAuthorizedInterviewIdMock).toHaveBeenLastCalledWith(null);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(analyticsContext.captureException).toHaveBeenCalledWith(cause, {
      feature: 'interview-load',
    });
  });

  it('writes nothing but the session: not the last-opened interview', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await act(async () => {
      lastShellProps().onStepChange(1, { progress: 50, totalSteps: 3 });
    });

    expect(updateSessionMock).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ currentStep: 1 }),
    );
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it('leaves recording the last-opened interview to the root build', async () => {
    subpath.isSubpath = false;
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await waitFor(() =>
      expect(updateSettingsMock).toHaveBeenCalledWith(
        expect.objectContaining({ lastActiveSessionId: 's1' }),
      ),
    );
  });

  it('opens an interview for review, as Interviewer 9’s review link asks', async () => {
    useSearchMock.mockReturnValue('mode=review');

    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    expect(lastShellProps().reviewMode).toBe(true);
  });
});
