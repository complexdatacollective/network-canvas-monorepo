import { act, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppI18nProvider } from '@codaco/app-i18n/react';
import type {
  CompletedAction,
  FinishHandler,
  InterviewPayload,
  ProtocolLocaleChangeHandler,
  SessionPayload,
} from '@codaco/interview';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { getLocaleMetadata } from '@codaco/protocol-validation';
import { InterviewerI18nProvider } from '~/i18n/InterviewerI18nProvider';
import { interviewerProductionLocales } from '~/i18n/locales';
import { LOCALE_PREFERENCE_KEY } from '~/i18n/preference';
import { recordStoredProtocolMigrationFailures } from '~/lib/protocol/storedProtocolMigrationFailures';
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

const getSettingsMock = vi.fn();
const getSessionMock = vi.fn();
const getProtocolByHashMock = vi.fn();
const markSessionFinishedMock = vi.fn();
const updateSessionMock = vi.fn();
const setSessionLocaleMock = vi.fn();
const updateSettingsMock = vi.fn();
vi.mock('~/lib/db/api', () => ({
  getSettings: (...a: unknown[]) => getSettingsMock(...a),
  getSession: (...a: unknown[]) => getSessionMock(...a),
  getProtocolByHash: (...a: unknown[]) => getProtocolByHashMock(...a),
  updateSession: (...a: unknown[]) => updateSessionMock(...a),
  setSessionLocale: (...a: unknown[]) => setSessionLocaleMock(...a),
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
  requestedLocales: readonly string[];
  onProtocolLocaleChange: ProtocolLocaleChangeHandler;
  initialStageOverrideIndex?: number;
  payload: InterviewPayload;
  onExit: () => void;
  onFinish: FinishHandler;
  completedActions?: readonly CompletedAction[];
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
  flags?: { isDevelopment?: boolean };
};

const { shellMock, shellInterfaceLocale } = vi.hoisted(() => ({
  shellMock: vi.fn<(props: CapturedShellProps) => void>(),
  shellInterfaceLocale: { current: 'en' },
}));
vi.mock('@codaco/interview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@codaco/interview')>();
  return {
    ...actual,
    Shell: (props: CapturedShellProps) => {
      shellMock(props);
      // A queued confirmation retains its original node. The provider stands
      // in for the Shell's own one, which carries the interview's interface
      // language rather than Interviewer's.
      const [queuedDescription] = useState(props.finishConfirmationDescription);
      return (
        <AppI18nProvider
          locale={shellInterfaceLocale.current}
          locales={interviewerProductionLocales}
          manageDocument={false}
        >
          <div data-testid="shell-mounted">
            {queuedDescription}
            {props.completedActions?.map((action, index) => (
              <button
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                type="button"
                onClick={action.onAction}
              >
                {action.label}
              </button>
            ))}
          </div>
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
    localePreference: null,
    locale: null,
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
      // Neither alphabetical nor default-first, so the offered order can only
      // come from the declaration.
      localization: { defaultLocale: 'en', locales: ['fr', 'ar', 'en'] },
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
    localePreference: null,
    locale: null,
    localeOptions: [],
    ...overrides,
  };
}

const finish = { stageId: 'finish', outcome: 'completed' } as const;

function finishInterview(props: CapturedShellProps) {
  return props.onFinish('s1', finish, new AbortController().signal);
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
  setSessionLocaleMock.mockResolvedValue(undefined);
  useSearchMock.mockReturnValue('');
  useRouteMock.mockReturnValue([true, { sessionId: 's1' }]);
  shellInterfaceLocale.current = 'en';
  refreshStepUpContextIdentities();
});

describe('InterviewRoute enter gate', () => {
  it("asks the interview for the browser languages rather than Interviewer's own language", async () => {
    const languages = vi
      .spyOn(navigator, 'languages', 'get')
      .mockReturnValue(['fr-CA', 'en-GB']);
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'es');
    getSettingsMock.mockResolvedValue({ requireUnlockOnEnter: false });
    try {
      render(
        <InterviewerI18nProvider>
          <InterviewRoute sessionId="s1" />
        </InterviewerI18nProvider>,
      );
      await screen.findByTestId('shell-mounted');
      expect(lastShellProps().requestedLocales).toEqual(['fr-CA', 'en-GB']);
    } finally {
      languages.mockRestore();
      localStorage.removeItem(LOCALE_PREFERENCE_KEY);
    }
  });

  it("words the finish confirmation in the interview's interface language", async () => {
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'en');
    shellInterfaceLocale.current = 'es';
    getSettingsMock.mockResolvedValue({ requireUnlockOnEnter: false });
    try {
      render(
        <InterviewerI18nProvider>
          <InterviewRoute sessionId="s1" />
        </InterviewerI18nProvider>,
      );
      const shell = await screen.findByTestId('shell-mounted');
      expect(shell).toHaveTextContent(
        'Al finalizar, se cierra esta entrevista.',
      );
      expect(shell).not.toHaveTextContent('Finishing ends this interview.');
    } finally {
      localStorage.removeItem(LOCALE_PREFERENCE_KEY);
    }
  });

  it('hydrates the stored language and offers every protocol language', async () => {
    getSettingsMock.mockResolvedValue({ requireUnlockOnEnter: false });
    getSessionMock.mockResolvedValue(
      makeSession({ localePreference: 'ar', locale: 'ar' }),
    );

    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    const { session } = lastShellProps().payload;
    expect(session.localePreference).toBe('ar');
    expect(session.locale).toBe('ar');
    expect(session.localeOptions.map(({ locale }) => locale)).toEqual([
      'fr',
      'ar',
      'en',
    ]);
    expect(session.localeOptions).toEqual(
      ['fr', 'ar', 'en'].map((locale) => getLocaleMetadata(locale)),
    );
  });

  it("stores the participant's language choice on the session without reloading the interview", async () => {
    getSettingsMock.mockResolvedValue({ requireUnlockOnEnter: false });
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    const payload = lastShellProps().payload;
    const reads = getSessionMock.mock.calls.length;
    updateSessionMock.mockClear();

    await act(async () => {
      await lastShellProps().onProtocolLocaleChange('s1', {
        locale: 'fr',
        localePreference: 'fr',
      });
    });

    expect(setSessionLocaleMock).toHaveBeenCalledWith('s1', {
      locale: 'fr',
      localePreference: 'fr',
    });
    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(lastShellProps().payload).toBe(payload);
    expect(getSessionMock).toHaveBeenCalledTimes(reads);
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

describe('InterviewRoute development tools', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { build: 'development', DEV: true },
    { build: 'production', DEV: false },
  ])(
    'connects Redux DevTools and the logger only in a development build ($build)',
    async ({ DEV }) => {
      vi.stubEnv('DEV', DEV);
      getSettingsMock.mockResolvedValue({ requireUnlockOnEnter: false });

      render(<InterviewRoute sessionId="s1" />);
      await screen.findByTestId('shell-mounted');

      expect(lastShellProps().flags).toEqual({ isDevelopment: DEV });
    },
  );
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

  it('records the finish stage and outcome, and leaves the completed state to the Shell', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await act(async () => {
      await lastShellProps().onFinish(
        's1',
        { stageId: 'finish-ineligible', outcome: 'ineligible' },
        new AbortController().signal,
      );
    });

    expect(markSessionFinishedMock).toHaveBeenCalledWith('s1', {
      stageId: 'finish-ineligible',
      outcome: 'ineligible',
    });
    // The Shell shows the completed state in place: the route neither
    // navigates nor replaces it, and offers Exit there.
    expect(screen.getByTestId('shell-mounted')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(lastShellProps().completedActions).toHaveLength(1);
  });

  it('writes no finish once the finish has been abandoned', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    const abandoned = new AbortController();
    abandoned.abort();

    let outcome: unknown;
    await act(async () => {
      outcome = await lastShellProps()
        .onFinish(
          's1',
          { stageId: 'finish-ineligible', outcome: 'ineligible' },
          abandoned.signal,
        )
        .then(
          () => 'resolved',
          (error: unknown) => error,
        );
    });

    // Rejected, so the Shell does not show a completed state, and nothing is
    // stored that it would then not be showing.
    expect(outcome).toMatchObject({ name: 'AbortError' });
    expect(markSessionFinishedMock).not.toHaveBeenCalled();
  });

  it("offers Exit on the completed state in the interview's interface language", async () => {
    localStorage.setItem(LOCALE_PREFERENCE_KEY, 'en');
    shellInterfaceLocale.current = 'es';
    try {
      render(
        <InterviewerI18nProvider>
          <InterviewRoute sessionId="s1" />
        </InterviewerI18nProvider>,
      );
      await screen.findByTestId('shell-mounted');

      expect(screen.getByRole('button', { name: 'Salir' })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Exit' }),
      ).not.toBeInTheDocument();
    } finally {
      localStorage.removeItem(LOCALE_PREFERENCE_KEY);
    }
  });

  it('exits home from the completed state', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    await act(async () => {
      await finishInterview(lastShellProps());
    });

    await invoke(() => screen.getByRole('button', { name: 'Exit' }).click());

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith(null);
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
      await onFinish('s1', finish, new AbortController().signal);
    });

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

  it('opens a finished session in its completed state, with Exit', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({
        currentStep: 4,
        finishedAt: '2026-01-02T00:00:00.000Z',
        finishStageId: 'finish-ineligible',
        finishOutcome: 'ineligible',
      }),
    );

    render(<InterviewRoute sessionId="s1" />);

    expect(await screen.findByTestId('shell-mounted')).toBeInTheDocument();
    const props = lastShellProps();
    expect(props.reviewMode).toBe(false);
    expect(props.payload.session.finishTime).toBe('2026-01-02T00:00:00.000Z');
    expect(props.payload.session.finishStageId).toBe('finish-ineligible');
    expect(props.disableAnalytics).toBe(true);
    expect(screen.queryByText('Read-only review')).not.toBeInTheDocument();

    await invoke(() => screen.getByRole('button', { name: 'Exit' }).click());

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(setAuthorizedInterviewIdMock).toHaveBeenCalledWith(null);
  });

  it('hands the Shell no finish stage for a session finished before they were recorded', async () => {
    getSessionMock.mockResolvedValue(
      makeSession({ finishedAt: '2026-01-02T00:00:00.000Z' }),
    );

    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    expect(lastShellProps().payload.session.finishStageId).toBeNull();
    expect(lastShellProps().reviewMode).toBe(false);
  });

  it('opens a finished session as a read-only review when review is asked for', async () => {
    useSearchMock.mockReturnValue('mode=review');
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
    // A review shows the stages; there is no completed state to act on.
    expect(lastShellProps().completedActions).toBeUndefined();
    expect(
      screen.queryByRole('button', { name: 'Exit' }),
    ).not.toBeInTheDocument();
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

    expect(updateSessionMock).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({
        currentStep: 1,
        progress: 50,
        resumeStageOverrideIndex: undefined,
      }),
      { protocolHash: 'h1' },
    );
  });

  // Every write names the protocol the interview loaded and carries the
  // session's whole state, so a write made after another tab migrated the
  // protocol can be kept under the protocol it was made against and carried
  // across the migration at the next launch, instead of being refused.
  it('writes the whole state, against the loaded protocol, on a step change and a sync', async () => {
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    updateSessionMock.mockClear();
    const stored = makeSession();

    act(() => {
      lastShellProps().onStepChange(1, { progress: 50, totalSteps: 4 });
    });
    expect(updateSessionMock).toHaveBeenLastCalledWith(
      's1',
      {
        network: stored.network,
        stageMetadata: undefined,
        currentStep: 1,
        progress: 50,
        resumeStageOverrideIndex: undefined,
      },
      { protocolHash: 'h1' },
    );

    const answered = {
      ...stored.network,
      nodes: [{ _uid: 'n1', type: 'person', attributes: {} }],
    } as SessionPayload['network'];
    await act(async () => {
      await lastShellProps().onSync(
        's1',
        makeSyncPayload({ network: answered }),
        { immediate: true, unloading: false },
      );
    });
    await waitFor(() =>
      expect(updateSessionMock).toHaveBeenLastCalledWith(
        's1',
        expect.objectContaining({ network: answered, currentStep: 1 }),
        { protocolHash: 'h1' },
      ),
    );

    act(() => {
      lastShellProps().onStepChange(2, { progress: 75, totalSteps: 4 });
    });
    expect(updateSessionMock).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({ network: answered, currentStep: 2 }),
      { protocolHash: 'h1' },
    );
  });

  it('honours explicit review intent when the stored session is unfinished', async () => {
    useSearchMock.mockReturnValue('mode=review');

    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');
    const { onFinish, onProtocolLocaleChange, onStepChange, onSync } =
      lastShellProps();

    await act(async () => {
      await onSync('s1', makeSyncPayload(), {
        immediate: true,
        unloading: false,
      });
      onStepChange(2, { progress: 75, totalSteps: 4 });
      await onProtocolLocaleChange('s1', {
        locale: 'fr',
        localePreference: 'fr',
      });
      await onFinish('s1', finish, new AbortController().signal);
    });

    expect(lastShellProps().reviewMode).toBe(true);
    expect(updateSessionMock).not.toHaveBeenCalled();
    expect(setSessionLocaleMock).not.toHaveBeenCalled();
    expect(markSessionFinishedMock).not.toHaveBeenCalled();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it.each([
    ['reviewing', 'mode=review'],
    ['showing the completed state of', ''],
  ])(
    'suppresses every session write while %s a finished session',
    async (_, search) => {
      useSearchMock.mockReturnValue(search);
      getSessionMock.mockResolvedValue(
        makeSession({ finishedAt: '2026-01-02T00:00:00.000Z' }),
      );

      render(<InterviewRoute sessionId="s1" />);
      await screen.findByTestId('shell-mounted');
      const { onFinish, onProtocolLocaleChange, onStepChange, onSync } =
        lastShellProps();

      await act(async () => {
        await onSync('s1', makeSyncPayload(), {
          immediate: true,
          unloading: false,
        });
        onStepChange(2, { progress: 75, totalSteps: 4 });
        await onProtocolLocaleChange('s1', {
          locale: 'fr',
          localePreference: 'fr',
        });
        await onFinish('s1', finish, new AbortController().signal);
      });

      expect(updateSessionMock).not.toHaveBeenCalled();
      expect(setSessionLocaleMock).not.toHaveBeenCalled();
      expect(markSessionFinishedMock).not.toHaveBeenCalled();
      expect(updateSettingsMock).not.toHaveBeenCalled();
    },
  );

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

  // A protocol at the runtime's version is held back when interviews a
  // pre-update tab wrote back under a hash it superseded could not be
  // carried onto it: none of its interviews runs until every one can.
  it('refuses to run a session whose protocol the sweep held back with its interviews', async () => {
    const protocol = makeProtocol();
    act(() => {
      recordStoredProtocolMigrationFailures([
        {
          name: 'Study',
          hash: protocol.hash,
          reason: 'one interview could not be migrated',
          kind: 'sessions',
          sessions: [{ id: 'late', reason: 'invalid' }],
        },
      ]);
    });

    try {
      render(<InterviewRoute sessionId="s1" />);

      expect(
        await screen.findByRole('heading', { name: /interview unavailable/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          /Some interviews recorded with this protocol could not be updated/,
        ),
      ).toBeInTheDocument();
      expect(shellMock).not.toHaveBeenCalled();
    } finally {
      act(() => recordStoredProtocolMigrationFailures([]));
    }
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

  it('applies the exit gate from the completed state', async () => {
    getSettingsMock.mockResolvedValue({
      requireUnlockOnEnter: false,
      requireUnlockOnExit: true,
      requireUnlockOnExport: false,
    });
    render(<InterviewRoute sessionId="s1" />);
    await screen.findByTestId('shell-mounted');

    await act(async () => {
      await finishInterview(lastShellProps());
    });

    requireFreshUnlockMock.mockResolvedValue({
      ok: false,
      reason: 'cancelled',
    });
    await invoke(() => screen.getByRole('button', { name: 'Exit' }).click());

    expect(requireFreshUnlockMock).toHaveBeenCalled();
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
