import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

// Interviewer 8 inside Interviewer 9's deploy (a /v8/ build) only unlocks the
// lock it shares with Interviewer 9. Every recovery that would reset the device
// becomes the way to Interviewer 9, which owns recovery.

const mocks = vi.hoisted(() => ({
  isSubpath: true,
  leaveForInterviewer9: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('~/lib/appBase', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/appBase')>()),
  get IS_SUBPATH_BUILD() {
    return mocks.isSubpath;
  },
}));

vi.mock('~/lib/handoff/interviewer9Navigation', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('~/lib/handoff/interviewer9Navigation')
  >()),
  leaveForInterviewer9: mocks.leaveForInterviewer9,
}));

vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => mocks.useAuth() }));
vi.mock('~/lib/pwa/passkeyWindowLimitation', () => ({
  hasPasskeyWindowLimitation: () => false,
}));
vi.mock('@codaco/art', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@codaco/art')>()),
  BackgroundLights: () => null,
}));

import { LockScreen } from '../LockScreen';
import { VaultRecoveryScreen } from '../VaultRecoveryScreen';

const authFor = (mode: 'pin' | 'biometric') => ({
  kind: 'locked' as const,
  mode,
  unlockWithPin: vi.fn(async () => ({ ok: true })),
  unlockWithPassphrase: vi.fn(async () => ({ ok: true })),
  unlockWithBiometric: vi.fn(async () => ({ ok: false })),
  unlockWithRecovery: vi.fn(async () => ({ ok: true })),
  verifyWithPin: vi.fn(async () => ({ ok: true })),
  verifyWithPassphrase: vi.fn(async () => ({ ok: true })),
  verifyBiometric: vi.fn(async () => ({ ok: false })),
  verifyWithRecovery: vi.fn(async () => ({ ok: true })),
  revoke: vi.fn(async () => undefined),
});

const MANAGE = 'Manage the lock in Interviewer';
const RESET = 'Recover by resetting';

beforeEach(() => {
  mocks.isSubpath = true;
  mocks.useAuth.mockReturnValue(authFor('pin'));
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('LockScreen in Interviewer 8 inside Interviewer 9', () => {
  it('offers the way to Interviewer 9 instead of a reset', async () => {
    const user = userEvent.setup();
    render(<LockScreen />);

    expect(
      screen.queryByRole('button', { name: RESET }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: MANAGE }));
    expect(mocks.leaveForInterviewer9).toHaveBeenCalledWith('/');
  });

  it('does the same in the biometric recovery dialog', async () => {
    mocks.useAuth.mockReturnValue(authFor('biometric'));
    const user = userEvent.setup();
    render(<LockScreen />);

    await user.click(
      screen.getByRole('button', { name: 'Recover with passphrase' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Recover with passphrase' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MANAGE })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: RESET }),
    ).not.toBeInTheDocument();
  });

  // Only an interview's own exit step may leave it.
  it('offers no way out over a locked interview', () => {
    window.history.replaceState(null, '', '/interview/session-1');
    render(<LockScreen />);

    expect(
      screen.queryByRole('button', { name: MANAGE }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: RESET }),
    ).not.toBeInTheDocument();
  });

  it('keeps the reset in the root app', () => {
    mocks.isSubpath = false;
    render(<LockScreen />);

    expect(screen.getByRole('button', { name: RESET })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: MANAGE }),
    ).not.toBeInTheDocument();
  });
});

describe('VaultRecoveryScreen in Interviewer 8 inside Interviewer 9', () => {
  const renderRecovery = () =>
    render(
      <DialogProvider>
        <VaultRecoveryScreen />
      </DialogProvider>,
    );

  it('offers the way to Interviewer 9 instead of resetting all app data', async () => {
    const user = userEvent.setup();
    renderRecovery();

    expect(
      screen.queryByRole('button', { name: 'Reset all app data' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: MANAGE }));
    expect(mocks.leaveForInterviewer9).toHaveBeenCalledWith('/');
  });

  it('keeps the reset in the root app', () => {
    mocks.isSubpath = false;
    renderRecovery();

    expect(
      screen.getByRole('button', { name: 'Reset all app data' }),
    ).toBeInTheDocument();
  });
});
