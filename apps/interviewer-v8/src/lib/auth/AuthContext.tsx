import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { getSettings, updateSettings } from '../db/api';
import { DEFAULT_SETTINGS } from '../db/types';
import { VAULT_STORAGE_KEY } from '../vault/vaultStore';
import * as authApi from './api';
import type { AuthMode } from './api';
import { useIdleTimer } from './idle';

export type AuthStateKind =
  | 'loading'
  | 'unconfigured'
  | 'corrupt'
  | 'locked'
  | 'unlocked';
export type IdleTimeoutMinutes = 1 | 5 | 15 | 30 | 60;

export type AuthState = {
  kind: AuthStateKind;
  mode?: AuthMode;
  idleTimeoutMinutes: IdleTimeoutMinutes;
};

type AuthActions = {
  refresh: () => Promise<void>;
  enrolWithoutLock: () => Promise<authApi.AuthResult>;
  enrolWithPin: (pin: string) => Promise<authApi.AuthResult>;
  enrolWithPassphrase: (phrase: string) => Promise<authApi.AuthResult>;
  enrolWithBiometric: (recoveryPhrase: string) => Promise<authApi.AuthResult>;
  unlockWithPin: (pin: string) => Promise<authApi.AuthResult>;
  unlockWithPassphrase: (phrase: string) => Promise<authApi.AuthResult>;
  unlockWithBiometric: () => Promise<authApi.AuthResult>;
  unlockWithRecovery: (phrase: string) => Promise<authApi.AuthResult>;
  reEnrolWithPin: (
    currentPin: string,
    nextPin: string,
  ) => Promise<authApi.AuthResult>;
  reEnrolWithPassphrase: (
    currentPhrase: string,
    nextPhrase: string,
  ) => Promise<authApi.AuthResult>;
  lock: () => Promise<void>;
  revoke: () => Promise<void>;
  setIdleTimeoutMinutes: (minutes: IdleTimeoutMinutes) => Promise<void>;
};

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

// Lock 30s after window blur / tab hide, separate from the idle timeout — a
// brief grace period to alt-tab without losing the session. Disabled in dev
// (Vite live-reload constantly steals focus).
const BLUR_LOCK_DELAY_MS = import.meta.env.DEV ? null : 30_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    kind: 'loading',
    idleTimeoutMinutes: DEFAULT_SETTINGS.idleTimeoutMinutes,
  });

  const refresh = useCallback(async () => {
    const s = await authApi.status();
    const kind: AuthStateKind = s.corrupt
      ? 'corrupt'
      : !s.configured
        ? 'unconfigured'
        : s.locked
          ? 'locked'
          : 'unlocked';

    let idleTimeoutMinutes: IdleTimeoutMinutes =
      DEFAULT_SETTINGS.idleTimeoutMinutes;
    if (kind === 'unlocked') {
      const settings = await getSettings();
      idleTimeoutMinutes =
        settings?.idleTimeoutMinutes ?? DEFAULT_SETTINGS.idleTimeoutMinutes;
    }

    setState({ kind, mode: s.mode, idleTimeoutMinutes });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lock = useCallback(async () => {
    await authApi.lock();
    await refresh();
  }, [refresh]);

  // The session DEK is per-tab module memory while the vault record is shared
  // localStorage. If another tab revokes and re-enrols, this tab's stale DEK
  // would encrypt rows the new vault can never decrypt (permanent data loss).
  // Force-lock this tab whenever the vault record changes in another tab so
  // AuthGate re-gates and the next unlock derives a fresh DEK.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== VAULT_STORAGE_KEY) return;
      void lock();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [lock]);

  const idleTimeoutMs = state.idleTimeoutMinutes * 60_000;
  useIdleTimer({
    timeoutMs: idleTimeoutMs,
    enabled: state.kind === 'unlocked' && state.mode !== 'none',
    onIdle: () => {
      void lock();
    },
    lockOnBlurMs: state.mode === 'none' ? null : BLUR_LOCK_DELAY_MS,
  });

  const runAndRefresh = useCallback(
    async (op: () => Promise<authApi.AuthResult>) => {
      const result = await op();
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const enrolWithoutLock = useCallback(
    () => runAndRefresh(() => authApi.enrolWithoutLock()),
    [runAndRefresh],
  );
  const enrolWithPin = useCallback(
    (pin: string) => runAndRefresh(() => authApi.enrolWithPin(pin)),
    [runAndRefresh],
  );
  const enrolWithPassphrase = useCallback(
    (phrase: string) =>
      runAndRefresh(() => authApi.enrolWithPassphrase(phrase)),
    [runAndRefresh],
  );
  const enrolWithBiometric = useCallback(
    (recoveryPhrase: string) =>
      runAndRefresh(() => authApi.enrolWithBiometric(recoveryPhrase)),
    [runAndRefresh],
  );
  const unlockWithPin = useCallback(
    (pin: string) => runAndRefresh(() => authApi.unlockWithPin(pin)),
    [runAndRefresh],
  );
  const unlockWithPassphrase = useCallback(
    (phrase: string) =>
      runAndRefresh(() => authApi.unlockWithPassphrase(phrase)),
    [runAndRefresh],
  );
  const unlockWithBiometric = useCallback(
    () => runAndRefresh(() => authApi.unlockWithBiometric()),
    [runAndRefresh],
  );
  const unlockWithRecovery = useCallback(
    (phrase: string) => runAndRefresh(() => authApi.unlockWithRecovery(phrase)),
    [runAndRefresh],
  );
  const reEnrolWithPin = useCallback(
    (currentPin: string, nextPin: string) =>
      runAndRefresh(() => authApi.reEnrolWithPin(currentPin, nextPin)),
    [runAndRefresh],
  );
  const reEnrolWithPassphrase = useCallback(
    (currentPhrase: string, nextPhrase: string) =>
      runAndRefresh(() =>
        authApi.reEnrolWithPassphrase(currentPhrase, nextPhrase),
      ),
    [runAndRefresh],
  );

  const revoke = useCallback(async () => {
    await authApi.revoke();
    await refresh();
  }, [refresh]);

  const setIdleTimeoutMinutes = useCallback(
    async (minutes: IdleTimeoutMinutes) => {
      await updateSettings({ idleTimeoutMinutes: minutes });
      await refresh();
    },
    [refresh],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      refresh,
      enrolWithoutLock,
      enrolWithPin,
      enrolWithPassphrase,
      enrolWithBiometric,
      unlockWithPin,
      unlockWithPassphrase,
      unlockWithBiometric,
      unlockWithRecovery,
      reEnrolWithPin,
      reEnrolWithPassphrase,
      lock,
      revoke,
      setIdleTimeoutMinutes,
    }),
    [
      state,
      refresh,
      enrolWithoutLock,
      enrolWithPin,
      enrolWithPassphrase,
      enrolWithBiometric,
      unlockWithPin,
      unlockWithPassphrase,
      unlockWithBiometric,
      unlockWithRecovery,
      reEnrolWithPin,
      reEnrolWithPassphrase,
      lock,
      revoke,
      setIdleTimeoutMinutes,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
