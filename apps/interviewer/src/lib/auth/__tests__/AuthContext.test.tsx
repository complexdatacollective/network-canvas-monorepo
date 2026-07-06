import 'fake-indexeddb/auto';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getSessionDek, setSessionDek } from '../../db/sessionKey';
import { clearVault, VAULT_STORAGE_KEY } from '../../vault/vaultStore';
import * as authApi from '../api';
import { AuthProvider, useAuth } from '../AuthContext';

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

beforeEach(() => {
  clearVault();
  setSessionDek(null);
});
afterEach(() => {
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
