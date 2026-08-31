import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getSettings,
  updateSettings,
  whenSessionWritesSettle,
} from '../db/api';
import { getSessionDek } from '../db/sessionKey';
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
  verifyWithPin: (pin: string) => Promise<authApi.AuthResult>;
  verifyWithPassphrase: (phrase: string) => Promise<authApi.AuthResult>;
  verifyBiometric: () => Promise<authApi.AuthResult>;
  verifyWithRecovery: (phrase: string) => Promise<authApi.AuthResult>;
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

export type AuthContextValue = AuthState & AuthActions;

export const AuthContext = createContext<AuthContextValue | null>(null);

// A stalled write must not hold the vault open past its idle deadline, so the
// drain below is bounded and the lock proceeds either way. Two seconds is far
// more than the local writes it waits on need. Giving up costs what locking
// without the drain would have cost anyway, so the bound only decides how long
// we wait — never whether a write that finishes in time survives.
const LOCK_DRAIN_TIMEOUT_MS = 2_000;

async function drainSessionWrites(): Promise<void> {
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    deadlineTimer = setTimeout(resolve, LOCK_DRAIN_TIMEOUT_MS);
  });
  try {
    await Promise.race([whenSessionWritesSettle(), deadline]);
  } finally {
    clearTimeout(deadlineTimer);
  }
}

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

  // Drop the key now, with no window for anything to finish writing first.
  const lockImmediately = useCallback(async () => {
    await authApi.lock();
    await refresh();
  }, [refresh]);

  // A session write reads the vault key when it runs, not when it is queued —
  // it waits its turn on the per-session chain, reads the stored row and
  // decrypts it, and only then encrypts. Clearing the key while any of that is
  // outstanding makes it fail closed and loses the answers it carried, which on
  // a frozen tab is exactly the moment an idle lock fires. Let those writes
  // settle first.
  const lock = useCallback(async () => {
    const keyToClear = getSessionDek();
    await drainSessionWrites();
    // Only clear the key this lock was asked to clear. The cross-tab
    // force-lock below does not queue behind this drain, so it can lock
    // mid-drain and the researcher can then unlock from the lock screen it
    // raised; clearing now would drop a key this lock was never asked about.
    // The reference only moves via setSessionDek, and re-enrolment rewraps the
    // same DEK without calling it, so a PIN change cannot misfire this.
    if (getSessionDek() !== keyToClear) return;
    await lockImmediately();
  }, [lockImmediately]);

  // The session DEK is per-tab module memory while the vault record is shared
  // localStorage. If another tab revokes and re-enrols, this tab's stale DEK
  // would encrypt rows the new vault can never decrypt (permanent data loss).
  // Force-lock this tab whenever the vault record changes in another tab so
  // AuthGate re-gates and the next unlock derives a fresh DEK. This is the one
  // path that must NOT wait for outstanding writes: they would be writing under
  // a DEK the other tab has already replaced, which is precisely the corruption
  // this listener exists to prevent, and a revoke has already deleted the
  // database they would land in.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== VAULT_STORAGE_KEY) return;
      void lockImmediately();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [lockImmediately]);

  const idleTimeoutMs = state.idleTimeoutMinutes * 60_000;
  useIdleTimer({
    timeoutMs: idleTimeoutMs,
    enabled: state.kind === 'unlocked' && state.mode !== 'none',
    onIdle: () => {
      void lock();
    },
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
  const verifyWithPin = useCallback(
    (pin: string) => authApi.verifyWithPin(pin),
    [],
  );
  const verifyWithPassphrase = useCallback(
    (phrase: string) => authApi.verifyWithPassphrase(phrase),
    [],
  );
  const verifyBiometric = useCallback(() => authApi.verifyBiometric(), []);
  const verifyWithRecovery = useCallback(
    (phrase: string) => authApi.verifyWithRecovery(phrase),
    [],
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
      verifyWithPin,
      verifyWithPassphrase,
      verifyBiometric,
      verifyWithRecovery,
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
      verifyWithPin,
      verifyWithPassphrase,
      verifyBiometric,
      verifyWithRecovery,
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
