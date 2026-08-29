import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getSessionDek, setSessionDek } from '../../db/sessionKey';
import { clearVault, VAULT_STORAGE_KEY } from '../../vault/vaultStore';
import * as authApi from '../api';
import { AuthProvider, useAuth } from '../AuthContext';
import { registerPreLockFlush } from '../preLockFlush';

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="kind">{auth.kind}</span>
      <span data-testid="mode">{auth.mode ?? '-'}</span>
      <button onClick={() => void auth.enrolWithPin('12345678')}>enrol</button>
      <button onClick={() => void auth.lock()}>lock</button>
      <button onClick={() => void auth.unlockWithPin('12345678')}>
        unlock
      </button>
    </div>
  );
}

// The pre-lock registry is module state; make sure nothing outlives its test.
const flushDisposers: Array<() => void> = [];

beforeEach(() => {
  clearVault();
  setSessionDek(null);
});
afterEach(() => {
  while (flushDisposers.length > 0) flushDisposers.pop()?.();
  clearVault();
  setSessionDek(null);
});

describe('AuthProvider transitions', () => {
  it('starts unconfigured, moves to unlocked on enrol, and holds no DEK in React state', async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unconfigured'),
    );

    await userEvent.click(screen.getByText('enrol'));
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('pin');
    // The DEK lives in the module holder, not in the provider's rendered state.
    expect(getSessionDek()).not.toBeNull();
  });

  it('lock clears the session DEK and flips to locked; unlock restores it', async () => {
    await authApi.enrolWithPin('12345678');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );

    await userEvent.click(screen.getByText('lock'));
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );
    expect(getSessionDek()).toBeNull();

    await userEvent.click(screen.getByText('unlock'));
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );
    expect(getSessionDek()).not.toBeNull();
  });

  it('runs registered pre-lock flushes while the DEK is still live', async () => {
    await authApi.enrolWithPin('12345678');
    // Stand in for the mounted interview's autosave flush. What it records is
    // the whole point: a flush that runs after the key is cleared cannot
    // encrypt anything, so recordCrypto would refuse the write and the answers
    // it was carrying would be lost.
    const dekSeenByFlush: Array<CryptoKey | null> = [];
    flushDisposers.push(
      registerPreLockFlush(async () => {
        dekSeenByFlush.push(getSessionDek());
      }),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );

    await userEvent.click(screen.getByText('lock'));
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );

    expect(dekSeenByFlush).toHaveLength(1);
    expect(dekSeenByFlush[0]).not.toBeNull();
    // The window closes as soon as the flush is done.
    expect(getSessionDek()).toBeNull();
  });

  it('coalesces overlapping lock attempts onto one drain', async () => {
    await authApi.enrolWithPin('12345678');
    let releaseFlush!: () => void;
    const flush = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseFlush = resolve;
        }),
    );
    flushDisposers.push(registerPreLockFlush(flush));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );

    // The idle timer can fire twice for one deadline — its own timeout, then
    // the visibility reconciliation on return — and a manual Lock can land on
    // top of either. The second must join the first, not open its own window
    // and go on to clear whatever DEK is installed when it finally finishes.
    await userEvent.click(screen.getByText('lock'));
    await userEvent.click(screen.getByText('lock'));
    expect(flush).toHaveBeenCalledTimes(1);
    expect(getSessionDek()).not.toBeNull();

    releaseFlush();
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('force-locks on a cross-tab vault change without flushing first', async () => {
    await authApi.enrolWithPin('12345678');
    const flush = vi.fn().mockResolvedValue(undefined);
    flushDisposers.push(registerPreLockFlush(flush));

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: VAULT_STORAGE_KEY }),
      );
    });
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );

    // The other tab's vault record is already the live one, so this tab's DEK
    // is stale: flushing under it would write rows the new vault can never
    // decrypt — the exact corruption this force-lock exists to prevent.
    expect(flush).not.toHaveBeenCalled();
    expect(getSessionDek()).toBeNull();
  });

  it('a simulated reload (fresh holder, existing record) renders locked', async () => {
    await authApi.enrolWithPin('12345678');
    act(() => setSessionDek(null)); // reload drops the in-memory DEK
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );
    expect(screen.getByTestId('mode')).toHaveTextContent('pin');
  });

  it('force-locks this tab when another tab changes the vault record (storage event)', async () => {
    await authApi.enrolWithPin('12345678');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );
    expect(getSessionDek()).not.toBeNull();

    // Another tab re-enrolled: the shared vault record changed. jsdom does not
    // fire `storage` across contexts, so dispatch the event this tab would see.
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: VAULT_STORAGE_KEY }),
      );
    });

    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('locked'),
    );
    expect(getSessionDek()).toBeNull();
  });

  it('ignores storage events for unrelated keys', async () => {
    await authApi.enrolWithPin('12345678');
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'some-other-key' }),
      );
    });

    // No force-lock: the DEK and gate are untouched.
    await waitFor(() =>
      expect(screen.getByTestId('kind')).toHaveTextContent('unlocked'),
    );
    expect(getSessionDek()).not.toBeNull();
  });
});
