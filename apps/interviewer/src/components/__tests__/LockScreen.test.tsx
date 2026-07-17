import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useAuthMock = vi.fn();
vi.mock('~/lib/auth/AuthContext', () => ({ useAuth: () => useAuthMock() }));

const hasPasskeyWindowLimitationMock = vi.fn(() => false);
vi.mock('~/lib/pwa/passkeyWindowLimitation', () => ({
  hasPasskeyWindowLimitation: () => hasPasskeyWindowLimitationMock(),
}));

import { readInterviewRecoveryRestriction } from '~/lib/auth/interviewRecoveryRestriction';

import { LockScreen, LockScreenView } from '../LockScreen';
import { AuthenticationDialog } from '../UnlockForms/AuthenticationDialog';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

const unlockWithPin = vi.fn(async () => ({ ok: true }));
const unlockWithPassphrase = vi.fn(async () => ({ ok: true }));
const unlockWithBiometric = vi.fn(async () => ({ ok: false }));
const unlockWithRecovery = vi.fn(async () => ({ ok: true }));
const verifyWithPin = vi.fn(async () => ({ ok: true }));
const verifyWithPassphrase = vi.fn(async () => ({ ok: true }));
const verifyBiometric = vi.fn(async () => ({ ok: false }));
const verifyWithRecovery = vi.fn(async () => ({ ok: true }));
const revoke = vi.fn<() => Promise<void>>(async () => undefined);

const authValue = {
  kind: 'locked' as const,
  mode: 'pin' as const,
  unlockWithPin,
  unlockWithPassphrase,
  unlockWithBiometric,
  unlockWithRecovery,
  verifyWithPin,
  verifyWithPassphrase,
  verifyBiometric,
  verifyWithRecovery,
  revoke,
};

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
  useAuthMock.mockReturnValue(authValue);
  hasPasskeyWindowLimitationMock.mockReturnValue(false);
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe('LockScreenView', () => {
  it.each([
    ['pin', 'PIN'],
    ['passphrase', 'Passphrase'],
    ['biometric', 'Unlock with biometrics'],
  ] as const)(
    'renders the %s authentication UI from context',
    (mode, label) => {
      useAuthMock.mockReturnValue({ ...authValue, mode });
      render(<LockScreenView />);

      expect(screen.getByText('Welcome back')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Authenticate to unlock and pick up where you left off.',
        ),
      ).toBeInTheDocument();
      if (mode === 'pin') {
        expect(screen.getByTestId('segmented-code-pin')).toBeInTheDocument();
      } else if (mode === 'passphrase') {
        expect(screen.getByLabelText(/passphrase/i)).toBeInTheDocument();
      } else {
        expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
      }
    },
  );

  it('renders nothing when the enrolled mode is none', () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'none' });
    const { container } = render(<LockScreenView />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LockScreen', () => {
  it('renders only while auth is locked', () => {
    const { rerender } = render(<LockScreen />);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();

    useAuthMock.mockReturnValue({
      ...authValue,
      kind: 'unlocked',
    });
    rerender(<LockScreen />);
    expect(screen.queryByText('Welcome back')).not.toBeInTheDocument();
  });

  it.each([
    ['/interview/session-1', 'pin'],
    ['/INTERVIEW/session-1', 'passphrase'],
  ] as const)(
    'hides destructive recovery for %s while using %s authentication',
    (route, mode) => {
      window.history.replaceState(null, '', route);
      useAuthMock.mockReturnValue({ ...authValue, mode });

      render(<LockScreen />);

      expect(screen.getByText('Welcome back')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Recover by resetting' }),
      ).not.toBeInTheDocument();
    },
  );

  it('keeps biometric passphrase recovery but hides reset on a protected interview', () => {
    window.history.replaceState(null, '', '/interview/session-1');
    hasPasskeyWindowLimitationMock.mockReturnValue(true);
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });

    render(<LockScreen />);

    expect(
      screen.getByRole('heading', { name: 'Recover with passphrase' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('passphrase-input')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Recover by resetting' }),
    ).not.toBeInTheDocument();
  });

  it('allows destructive recovery at home despite stale interview authorization', () => {
    window.sessionStorage.setItem(
      'interviewer:authorized-interview-id',
      'stale-session',
    );

    render(<LockScreen />);

    expect(
      screen.getByRole('button', { name: 'Recover by resetting' }),
    ).toBeInTheDocument();
  });

  it('keeps destructive recovery hidden when the URL changes while locked', () => {
    window.history.replaceState(null, '', '/interview/session-1');
    const { rerender } = render(<LockScreen />);

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    rerender(<LockScreen />);

    expect(window.location.pathname).toBe('/');
    expect(
      screen.queryByRole('button', { name: 'Recover by resetting' }),
    ).not.toBeInTheDocument();
  });

  it('uses the lock-specific marker to restrict recovery after reload', () => {
    window.history.replaceState(null, '', '/interview/session-1');
    const firstLock = render(<LockScreen />);
    expect(readInterviewRecoveryRestriction()).toBe(true);
    firstLock.unmount();

    window.history.replaceState(null, '', '/');
    render(<LockScreen />);

    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Recover by resetting' }),
    ).not.toBeInTheDocument();
  });
});

describe('AuthenticationDialog', () => {
  it('automatically attempts biometrics once per open cycle', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });
    const { rerender } = render(
      <AuthenticationDialog
        open
        title="Welcome back"
        description="Authenticate to continue."
      />,
    );

    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    rerender(
      <AuthenticationDialog
        open={false}
        title="Welcome back"
        description="Authenticate to continue."
      />,
    );
    rerender(
      <AuthenticationDialog
        open
        title="Welcome back"
        description="Authenticate to continue."
      />,
    );

    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(2));
  });

  it('attempts biometrics only once during Strict Mode effect replay', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });
    const pendingAttempt = deferred<{ ok: boolean }>();
    unlockWithBiometric.mockImplementationOnce(() => pendingAttempt.promise);
    const onAuthenticated = vi.fn();

    render(
      <StrictMode>
        <AuthenticationDialog
          title="Welcome back"
          description="Authenticate to continue."
          onAuthenticated={onAuthenticated}
        />
      </StrictMode>,
    );

    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    await act(async () => {
      pendingAttempt.resolve({ ok: true });
    });

    expect(unlockWithBiometric).toHaveBeenCalledTimes(1);
    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('ignores a pending PIN success after cancellation', async () => {
    const pendingPin = deferred<{ ok: boolean }>();
    unlockWithPin.mockImplementationOnce(() => pendingPin.promise);
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    render(
      <AuthenticationDialog
        open
        title="Welcome back"
        description="Authenticate to continue."
        showCancel
        onCancel={vi.fn()}
        onAuthenticated={onAuthenticated}
      />,
    );

    await user.type(screen.getByLabelText('Digit 1 of 8, hidden'), '12345678');
    await waitFor(() => expect(unlockWithPin).toHaveBeenCalledWith('12345678'));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => {
      pendingPin.resolve({ ok: true });
    });

    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('ignores a pending passphrase success from a previous open cycle', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'passphrase' });
    const staleAttempt = deferred<{ ok: boolean }>();
    const currentAttempt = deferred<{ ok: boolean }>();
    unlockWithPassphrase
      .mockImplementationOnce(() => staleAttempt.promise)
      .mockImplementationOnce(() => currentAttempt.promise);
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    const dialog = (open: boolean) => (
      <AuthenticationDialog
        open={open}
        title="Welcome back"
        description="Authenticate to continue."
        onAuthenticated={onAuthenticated}
      />
    );
    const { rerender } = render(dialog(true));

    await user.type(screen.getByLabelText(/passphrase/i), 'stale phrase');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() =>
      expect(unlockWithPassphrase).toHaveBeenCalledWith('stale phrase'),
    );

    rerender(dialog(false));
    rerender(dialog(true));
    await act(async () => {
      staleAttempt.resolve({ ok: true });
    });
    expect(onAuthenticated).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/passphrase/i), 'current phrase');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() =>
      expect(unlockWithPassphrase).toHaveBeenCalledWith('current phrase'),
    );
    await act(async () => {
      currentAttempt.resolve({ ok: true });
    });

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('keeps a reopened recovery dialog open when a cancelled attempt resolves', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });
    const staleAttempt = deferred<{ ok: boolean }>();
    const currentAttempt = deferred<{ ok: boolean }>();
    unlockWithRecovery
      .mockImplementationOnce(() => staleAttempt.promise)
      .mockImplementationOnce(() => currentAttempt.promise);
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        allowRecovery
        onAuthenticated={onAuthenticated}
      />,
    );

    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    await user.click(
      screen.getByRole('button', { name: 'Recover with passphrase' }),
    );
    await user.type(screen.getByTestId('passphrase-input'), 'stale recovery');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() =>
      expect(unlockWithRecovery).toHaveBeenCalledWith('stale recovery'),
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', { name: 'Recover with passphrase' }),
    );

    await act(async () => {
      staleAttempt.resolve({ ok: true });
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(
      screen.getByRole('heading', { name: 'Recover with passphrase' }),
    ).toBeInTheDocument();

    await user.type(screen.getByTestId('passphrase-input'), 'fresh recovery');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() =>
      expect(unlockWithRecovery).toHaveBeenCalledWith('fresh recovery'),
    );
    await act(async () => {
      currentAttempt.resolve({ ok: true });
    });

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('does not let a stale biometric attempt complete a reopened dialog', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });
    const staleAttempt = deferred<{ ok: boolean }>();
    const currentAttempt = deferred<{ ok: boolean }>();
    unlockWithBiometric
      .mockImplementationOnce(() => staleAttempt.promise)
      .mockImplementationOnce(() => currentAttempt.promise);
    const onAuthenticated = vi.fn();
    const dialog = (open: boolean) => (
      <AuthenticationDialog
        open={open}
        title="Welcome back"
        description="Authenticate to continue."
        onAuthenticated={onAuthenticated}
      />
    );
    const { rerender } = render(dialog(true));

    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(1));
    rerender(dialog(false));
    rerender(dialog(true));
    await waitFor(() => expect(unlockWithBiometric).toHaveBeenCalledTimes(2));

    await act(async () => {
      staleAttempt.resolve({ ok: true });
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Unlock with biometrics' }),
    ).toBeDisabled();

    await act(async () => {
      currentAttempt.resolve({ ok: true });
    });

    expect(onAuthenticated).toHaveBeenCalledTimes(1);
  });

  it('routes an unlocked passphrase challenge through verification', async () => {
    useAuthMock.mockReturnValue({
      ...authValue,
      kind: 'unlocked',
      mode: 'passphrase',
    });
    const user = userEvent.setup();
    render(
      <AuthenticationDialog
        title="Confirm your identity"
        description="Authenticate to continue."
      />,
    );

    await user.type(screen.getByLabelText(/passphrase/i), 'correct horse');
    await user.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() =>
      expect(verifyWithPassphrase).toHaveBeenCalledWith('correct horse'),
    );
    expect(unlockWithPassphrase).not.toHaveBeenCalled();
  });

  it('shows cancellation controls only when requested', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();

    rerender(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        showCancel
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('associates the visible description with the dialog', () => {
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
      />,
    );

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Authenticate to continue.',
    );
  });

  it('clears a passphrase when the dialog closes and reopens', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'passphrase' });
    const user = userEvent.setup();
    const { rerender } = render(
      <AuthenticationDialog
        open
        title="Confirm your identity"
        description="Authenticate to continue."
        showCancel
        onCancel={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/passphrase/i), 'do not retain me');
    rerender(
      <AuthenticationDialog
        open={false}
        title="Confirm your identity"
        description="Authenticate to continue."
        showCancel
        onCancel={vi.fn()}
      />,
    );
    rerender(
      <AuthenticationDialog
        open
        title="Confirm your identity"
        description="Authenticate to continue."
        showCancel
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/passphrase/i)).toHaveValue('');
  });

  it('offers passphrase recovery for biometric authentication', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });
    const user = userEvent.setup();
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        allowRecovery
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Recover with passphrase' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Recover with passphrase' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Recover by resetting' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await user.type(
      await screen.findByTestId('passphrase-input'),
      'recovery phrase',
    );
    await user.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() =>
      expect(unlockWithRecovery).toHaveBeenCalledWith('recovery phrase'),
    );
  });

  it('clears a recovery passphrase after returning to the main dialog', async () => {
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });
    const user = userEvent.setup();
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        allowRecovery
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Recover with passphrase' }),
    );
    await user.type(screen.getByTestId('passphrase-input'), 'do not retain me');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', { name: 'Recover with passphrase' }),
    );

    expect(screen.getByTestId('passphrase-input')).toHaveValue('');
  });

  it('offers destructive reset recovery for PIN authentication', () => {
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        allowRecovery
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Recover by resetting' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Recover with passphrase' }),
    ).not.toBeInTheDocument();
  });

  it('hides recovery actions when recovery is not allowed', () => {
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Recover by resetting' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Recover with passphrase' }),
    ).not.toBeInTheDocument();
  });

  it('opens passphrase recovery immediately in a limited biometric window', () => {
    hasPasskeyWindowLimitationMock.mockReturnValue(true);
    useAuthMock.mockReturnValue({ ...authValue, mode: 'biometric' });
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        allowRecovery
      />,
    );

    expect(
      screen.getByText(/isn't available in this installed app/i),
    ).toBeInTheDocument();
    expect(unlockWithBiometric).not.toHaveBeenCalled();
  });

  it('keeps destructive reset open and disables cancellation while deleting', async () => {
    let finishReset!: () => void;
    revoke.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishReset = resolve;
        }),
    );
    const user = userEvent.setup();
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        allowRecovery
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Recover by resetting' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Permanently delete' }),
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(
      screen.getByRole('heading', { name: 'Reset all app data?' }),
    ).toBeInTheDocument();

    await act(async () => {
      finishReset();
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Reset all app data?' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('clears a reset error when the confirmation is reopened', async () => {
    revoke.mockRejectedValueOnce(new Error('Reset failed.'));
    const user = userEvent.setup();
    render(
      <AuthenticationDialog
        title="Welcome back"
        description="Authenticate to continue."
        allowRecovery
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Recover by resetting' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'Permanently delete' }),
    );
    expect(await screen.findByText('Reset failed.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(
      screen.getByRole('button', { name: 'Recover by resetting' }),
    );

    expect(screen.queryByText('Reset failed.')).not.toBeInTheDocument();
  });
});
