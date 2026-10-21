import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthStateKind } from '~/lib/auth/AuthContext';

const {
  mockUseAuth,
  mockUseLocation,
  mockNavigate,
  mockIsRunningInstalled,
  mockStoredProtocolMigration,
} = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockUseLocation: vi.fn(),
  mockNavigate: vi.fn(),
  mockIsRunningInstalled: vi.fn(),
  mockStoredProtocolMigration: vi.fn(),
}));

vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => mockUseAuth() }));

const subpath = vi.hoisted(() => ({
  isSubpath: false,
  returnToInterviewer9: vi.fn(),
}));

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return subpath.isSubpath;
  },
}));

vi.mock('~/lib/interviewer9Navigation', () => ({
  returnToInterviewer9: subpath.returnToInterviewer9,
}));

// The real hook reaches into Dexie. What the gate is responsible for is when it
// runs the sweep and what it does while the sweep is pending.
vi.mock('~/lib/protocol/useStoredProtocolMigration', () => ({
  useStoredProtocolMigration: (enabled: boolean) =>
    mockStoredProtocolMigration(enabled),
}));

vi.mock('wouter', () => ({
  useLocation: () => mockUseLocation(),
}));

vi.mock('~/lib/pwa/isRunningInstalled', () => ({
  isRunningInstalled: () => mockIsRunningInstalled(),
}));

// The gate's locked/corrupt branches render heavy screens that pull in their
// own providers; stub them so this test isolates the gate/redirect logic.
vi.mock('../LockScreen', () => ({
  LockScreen: () => <div data-testid="lock-screen" />,
}));
vi.mock('../VaultRecoveryScreen', () => ({
  VaultRecoveryScreen: () => <div data-testid="vault-recovery-screen" />,
}));

import { AuthGate } from '../AuthGate';

const CHILD = <div data-testid="app-child">app</div>;

function setup({
  kind,
  location = '/',
  installed = false,
  migrationPhase = 'settled',
}: {
  kind: AuthStateKind;
  location?: string;
  installed?: boolean;
  migrationPhase?: 'pending' | 'settled';
}) {
  mockUseAuth.mockReturnValue({ kind });
  mockUseLocation.mockReturnValue([location, mockNavigate]);
  mockIsRunningInstalled.mockReturnValue(installed);
  mockStoredProtocolMigration.mockReturnValue(migrationPhase);
  return render(<AuthGate>{CHILD}</AuthGate>);
}

afterEach(() => {
  vi.clearAllMocks();
  subpath.isSubpath = false;
});

// Interviewer 8 inside Interviewer 9's deploy shares Interviewer 9's lock and
// never sets one up: where set-up is required, the device belongs in
// Interviewer 9, which forces set-up under the same rule. Nor does it have
// onboarding, so an unlocked /welcome is not sent Home. (App.tsx returns every
// address but an interview to Interviewer 9 before this gate.)
describe('AuthGate — Interviewer 8 inside Interviewer 9 (a /v8/ build)', () => {
  it('returns an unconfigured installed app to Interviewer 9 to set up the lock', () => {
    subpath.isSubpath = true;
    setup({ kind: 'unconfigured', installed: true });

    expect(subpath.returnToInterviewer9).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.queryByTestId('app-child')).not.toBeInTheDocument();
  });

  it('returns the moment the app is installed while unconfigured', () => {
    subpath.isSubpath = true;
    setup({ kind: 'unconfigured', installed: false });
    expect(subpath.returnToInterviewer9).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(subpath.returnToInterviewer9).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // Interviewer 9 runs without a lock in a browser tab, so the interviews it
  // opens here must run here too, rather than bounce back to Interviewer 9.
  it('runs an interview in an unconfigured browser tab without a lock, as Interviewer 9 does', () => {
    subpath.isSubpath = true;
    setup({
      kind: 'unconfigured',
      installed: false,
      location: '/interview/s1',
    });

    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(subpath.returnToInterviewer9).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // The database is Interviewer 9's, and this build writes nothing but its
  // interview's session row.
  it.each(['unlocked', 'unconfigured'] as const)(
    'never runs the stored-protocol migration, nor waits for it (%s)',
    (kind) => {
      subpath.isSubpath = true;
      setup({ kind, location: '/interview/s1', migrationPhase: 'pending' });

      expect(mockStoredProtocolMigration).not.toHaveBeenCalledWith(true);
      expect(screen.getByTestId('app-child')).toBeInTheDocument();
    },
  );

  it('unlocks with the shared lock as usual', () => {
    subpath.isSubpath = true;
    setup({ kind: 'locked' });

    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
    expect(subpath.returnToInterviewer9).not.toHaveBeenCalled();
  });

  it('runs the app once unlocked', () => {
    subpath.isSubpath = true;
    setup({ kind: 'unlocked' });

    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(subpath.returnToInterviewer9).not.toHaveBeenCalled();
  });

  it('leaves /welcome alone once unlocked: there is no Home to send it to', () => {
    subpath.isSubpath = true;
    setup({ kind: 'unlocked', location: '/welcome' });

    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('never returns the root app to Interviewer 9', () => {
    setup({ kind: 'unconfigured', installed: true });

    expect(subpath.returnToInterviewer9).not.toHaveBeenCalled();
  });
});

describe('AuthGate — unconfigured', () => {
  it('renders the app (no /welcome redirect) in a plain browser tab', () => {
    setup({ kind: 'unconfigured', installed: false });
    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects to /welcome when running as an installed PWA', () => {
    setup({ kind: 'unconfigured', location: '/', installed: true });
    expect(mockNavigate).toHaveBeenCalledWith('/welcome', { replace: true });
    // Spinner holds; the app child must not paint mid-redirect.
    expect(screen.queryByTestId('app-child')).not.toBeInTheDocument();
  });

  it('renders the wizard (no redirect) when already on /welcome', () => {
    // Installed + already on /welcome: the wizard route renders, no redirect
    // loop. children is the wizard route in the real tree.
    setup({ kind: 'unconfigured', location: '/welcome', installed: true });
    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not redirect a browser tab even when on a non-welcome route', () => {
    setup({ kind: 'unconfigured', location: '/data', installed: false });
    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('AuthGate — appinstalled', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ kind: 'unconfigured' });
    mockUseLocation.mockReturnValue(['/', mockNavigate]);
    // Simulate installing from a browser tab: display-mode has not flipped yet.
    mockIsRunningInstalled.mockReturnValue(false);
    mockStoredProtocolMigration.mockReturnValue('settled');
  });

  it('navigates to /welcome when appinstalled fires while unconfigured', () => {
    render(<AuthGate>{CHILD}</AuthGate>);
    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/welcome', { replace: true });
  });

  it('removes the appinstalled listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<AuthGate>{CHILD}</AuthGate>);

    const added = addSpy.mock.calls.find(([type]) => type === 'appinstalled');
    expect(added).toBeDefined();

    unmount();
    const removed = removeSpy.mock.calls.find(
      ([type]) => type === 'appinstalled',
    );
    expect(removed).toBeDefined();
    expect(removed?.[1]).toBe(added?.[1]);
  });
});

describe('AuthGate — other states unchanged', () => {
  it('shows the spinner while loading (browser tab)', () => {
    setup({ kind: 'loading', installed: false });
    expect(screen.queryByTestId('app-child')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders the vault-recovery screen when corrupt', () => {
    setup({ kind: 'corrupt', installed: false });
    expect(screen.getByTestId('vault-recovery-screen')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders the lock screen when locked', () => {
    setup({ kind: 'locked', installed: false });
    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('renders the app when unlocked', () => {
    setup({ kind: 'unlocked', location: '/', installed: false });
    expect(screen.getByTestId('app-child')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('redirects unlocked → home when landing on /welcome', () => {
    setup({ kind: 'unlocked', location: '/welcome', installed: false });
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    expect(screen.queryByTestId('app-child')).not.toBeInTheDocument();
  });
});

describe('AuthGate — stored-protocol migration', () => {
  it.each([
    ['unlocked', true],
    ['unconfigured', true],
    ['locked', false],
    ['corrupt', false],
    ['loading', false],
  ] as [AuthStateKind, boolean][])(
    'runs the sweep when %s only if the database is readable',
    (kind, expected) => {
      setup({ kind });
      expect(mockStoredProtocolMigration).toHaveBeenCalledWith(expected);
    },
  );

  it('holds the spinner until the sweep settles, so no route can read a stale protocol', () => {
    setup({ kind: 'unlocked', migrationPhase: 'pending' });
    expect(screen.queryByTestId('app-child')).not.toBeInTheDocument();
  });

  it('renders the app once the sweep settles', () => {
    setup({ kind: 'unlocked', migrationPhase: 'settled' });
    expect(screen.getByTestId('app-child')).toBeInTheDocument();
  });

  it('still shows the lock screen while the sweep has not run', () => {
    setup({ kind: 'locked', migrationPhase: 'pending' });
    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
  });
});
