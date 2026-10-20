import { act, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthStateKind } from '~/lib/auth/AuthContext';

import { interviewerCatalogSource } from '../locales/catalogs';

// Interviewer 8 inside Interviewer 9 (a /v8/ build) is the interview alone,
// framed by Interviewer 9. Framed, every other address ends the embedded
// interview at once, whatever the lock's state, before any lock screen,
// onboarding or Home is shown; so does an interview this app cannot run.
// Loaded at the top level, every address returns to Interviewer 9 at once.
// The real AuthGate stands in front of the routes here, so these cases also
// hold its ordering to that.

const mocks = vi.hoisted(() => ({
  auth: { kind: 'locked' as string },
  embedded: true,
  framedByAnotherOrigin: false,
  closed: false,
  closedListeners: new Set<() => void>(),
  installed: false,
  returnToInterviewer9: vi.fn(),
  schemaVersion: vi.fn(async (_sessionId: string): Promise<number | null> => 8),
}));

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  IS_SUBPATH_BUILD: true,
  ROUTER_BASE: '/v8',
}));
vi.mock('~/lib/interviewer9Embed', () => ({
  get IS_EMBEDDED_IN_INTERVIEWER_9() {
    return mocks.embedded;
  },
  get IS_FRAMED_BY_ANOTHER_ORIGIN() {
    return mocks.framedByAnotherOrigin;
  },
  isEmbedClosed: () => mocks.closed,
  subscribeEmbedClosed: (listener: () => void) => {
    mocks.closedListeners.add(listener);
    return () => mocks.closedListeners.delete(listener);
  },
}));
vi.mock('~/lib/interviewer9Navigation', () => ({
  returnToInterviewer9: () => mocks.returnToInterviewer9(),
}));
vi.mock('~/lib/db/api', () => ({
  getSessionProtocolSchemaVersion: (sessionId: string) =>
    mocks.schemaVersion(sessionId),
}));
vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('~/lib/pwa/isRunningInstalled', () => ({
  isRunningInstalled: () => mocks.installed,
}));
vi.mock('~/lib/protocol/useStoredProtocolMigration', () => ({
  useStoredProtocolMigration: () => 'settled',
}));
vi.mock('~/providers/AppProviders', () => ({
  AppProviders: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('~/components/AppUpdate/AppUpdateProvider', () => ({
  AppUpdateProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('~/components/LockScreen', () => ({
  LockScreen: () => <div data-testid="lock-screen" />,
}));
vi.mock('~/components/VaultRecoveryScreen', () => ({
  VaultRecoveryScreen: () => <div data-testid="vault-recovery" />,
}));
vi.mock('~/routes/Home', () => ({
  HomeRoute: () => <div data-testid="home" />,
}));
vi.mock('~/routes/Welcome', () => ({
  WelcomeRoute: () => <div data-testid="welcome" />,
}));
vi.mock('~/routes/NotFound', () => ({
  NotFoundRoute: () => <div data-testid="not-found" />,
}));
vi.mock('~/routes/Interview', () => ({
  InterviewRoute: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="interview">{sessionId}</div>
  ),
}));
vi.mock('@codaco/art', () => ({ BackgroundLights: () => null }));

import App from '../App';

await interviewerCatalogSource.load('en');

const OWN_SCREENS = [
  'lock-screen',
  'vault-recovery',
  'home',
  'welcome',
  'not-found',
  'interview',
];

const expectNoScreenOfItsOwn = () => {
  for (const id of OWN_SCREENS) {
    expect(screen.queryByTestId(id)).not.toBeInTheDocument();
  }
};

const openAt = (path: string) => {
  window.history.replaceState(null, '', path);
  return render(<App />);
};

beforeEach(() => {
  mocks.auth = { kind: 'locked' };
  mocks.embedded = true;
  mocks.framedByAnotherOrigin = false;
  mocks.closed = false;
  mocks.closedListeners.clear();
  mocks.installed = false;
  mocks.schemaVersion.mockResolvedValue(8);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('a /v8/ address loaded at the top level, not framed', () => {
  it.each([
    '/v8/interview/s1',
    '/v8/interview/s1?mode=review',
    '/v8/',
    '/v8/data',
  ])('returns to Interviewer 9 at once, whatever the lock (%s)', (path) => {
    mocks.embedded = false;
    mocks.auth = { kind: 'unlocked' };

    openAt(path);

    expect(mocks.returnToInterviewer9).toHaveBeenCalledTimes(1);
    expectNoScreenOfItsOwn();
    // Interviewer 9 hosts it; nothing here even looks the interview up.
    expect(mocks.schemaVersion).not.toHaveBeenCalled();
  });
});

describe('a /v8/ address framed by a page of another origin', () => {
  it.each(['/v8/interview/s1', '/v8/'])(
    'renders nothing, and goes nowhere (%s)',
    (path) => {
      mocks.embedded = false;
      mocks.framedByAnotherOrigin = true;
      mocks.auth = { kind: 'unlocked' };

      openAt(path);

      expect(mocks.returnToInterviewer9).not.toHaveBeenCalled();
      expectNoScreenOfItsOwn();
      expect(mocks.schemaVersion).not.toHaveBeenCalled();
    },
  );
});

describe('an embedded interview that has ended', () => {
  it('renders nothing more, and returns nowhere', async () => {
    mocks.auth = { kind: 'unlocked' };
    openAt('/v8/interview/s1');
    expect(await screen.findByTestId('interview')).toBeInTheDocument();

    act(() => {
      mocks.closed = true;
      for (const listener of mocks.closedListeners) listener();
    });

    expectNoScreenOfItsOwn();
    expect(mocks.returnToInterviewer9).not.toHaveBeenCalled();
  });
});

describe('a /v8/ address other than an interview', () => {
  const states: { kind: AuthStateKind; installed: boolean }[] = [
    { kind: 'locked', installed: false },
    { kind: 'unconfigured', installed: false },
    { kind: 'unconfigured', installed: true },
    { kind: 'unlocked', installed: false },
    { kind: 'corrupt', installed: false },
    { kind: 'loading', installed: false },
  ];
  const paths = [
    '/v8/',
    '/v8',
    '/v8/data',
    '/v8/welcome',
    '/v8/settings',
    '/v8/interview/',
    '/v8/interview/s1/extra',
  ];

  for (const { kind, installed } of states) {
    it.each(paths)(
      `returns to Interviewer 9 at once when ${kind}${installed ? ' and installed' : ''} (%s)`,
      (path) => {
        mocks.auth = { kind };
        mocks.installed = installed;

        openAt(path);

        expect(mocks.returnToInterviewer9).toHaveBeenCalledTimes(1);
        expectNoScreenOfItsOwn();
        // Nothing about an interview was even looked up.
        expect(mocks.schemaVersion).not.toHaveBeenCalled();
      },
    );
  }
});

describe('a /v8/ interview', () => {
  it('keeps Back inert while its lock screen shows', async () => {
    openAt('/v8/interview/s1');
    expect(await screen.findByTestId('lock-screen')).toBeInTheDocument();
    expect(window.history.state).toEqual({ ncBackGuard: true });

    // The lock screen stands in for the interview route and its own guard:
    // a Back that pops the pinned entry is pinned again.
    window.history.replaceState(null, '', '/v8/interview/s1');
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(window.history.state).toEqual({ ncBackGuard: true });
    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
  });

  it('shows the lock screen over an interview it can run, when locked', async () => {
    openAt('/v8/interview/s1');

    expect(await screen.findByTestId('lock-screen')).toBeInTheDocument();
    expect(mocks.schemaVersion).toHaveBeenCalledWith('s1');
    expect(mocks.returnToInterviewer9).not.toHaveBeenCalled();
  });

  it('runs an interview it can run, once unlocked, with the review mode kept', async () => {
    mocks.auth = { kind: 'unlocked' };

    openAt('/v8/interview/s1?mode=review');

    expect(await screen.findByTestId('interview')).toHaveTextContent('s1');
    expect(window.location.search).toBe('?mode=review');
    expect(mocks.returnToInterviewer9).not.toHaveBeenCalled();
  });

  it.each([
    ['a session of a schema 9 protocol', 9],
    ['a session of a schema 7 protocol', 7],
    ['no such session', null],
  ])(
    'returns to Interviewer 9 for %s, before the lock screen',
    async (_case, schemaVersion) => {
      mocks.schemaVersion.mockResolvedValue(schemaVersion);

      openAt('/v8/interview/s9');

      await waitFor(() => {
        expect(mocks.returnToInterviewer9).toHaveBeenCalledTimes(1);
      });
      expectNoScreenOfItsOwn();
    },
  );

  it('returns to Interviewer 9 when the interview cannot be looked up', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.schemaVersion.mockRejectedValue(new Error('IndexedDB failed'));

    openAt('/v8/interview/s1');

    await waitFor(() => {
      expect(mocks.returnToInterviewer9).toHaveBeenCalledTimes(1);
    });
    expectNoScreenOfItsOwn();
  });

  it('shows nothing of its own while it looks the interview up', async () => {
    let resolve: (version: number) => void = () => {};
    mocks.schemaVersion.mockReturnValue(
      new Promise<number>((done) => {
        resolve = done;
      }),
    );

    openAt('/v8/interview/s1');
    expectNoScreenOfItsOwn();

    await act(async () => {
      resolve(8);
    });
    expect(await screen.findByTestId('lock-screen')).toBeInTheDocument();
    expect(mocks.returnToInterviewer9).not.toHaveBeenCalled();
  });
});
