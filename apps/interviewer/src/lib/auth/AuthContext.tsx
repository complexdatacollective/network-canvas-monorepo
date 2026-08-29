import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getSettings, updateSettings } from '../db/api';
import { getSessionDek } from '../db/sessionKey';
import { DEFAULT_SETTINGS } from '../db/types';
import { VAULT_STORAGE_KEY } from '../vault/vaultStore';
import * as authApi from './api';
import type { AuthMode } from './api';
import { useIdleTimer } from './idle';
import { runPreLockFlush } from './preLockFlush';

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

  // Drop the key now, with no window for anything to write first.
  const lockImmediately = useCallback(async () => {
    await authApi.lock();
    await refresh();
  }, [refresh]);

  // Anything still holding participant data in memory can only persist it while
  // the DEK is live — past this point `recordCrypto` fails closed and the write
  // is refused. A lock that fires while the mounted interview has answers in
  // its autosave debounce would otherwise destroy them, so let the registered
  // holders drain first. `runPreLockFlush` bounds its own wait, so a write that
  // hangs cannot keep the vault open past its idle deadline.
  //
  // Concurrent calls share one lock rather than each opening a drain window:
  // the idle timer can fire twice for a single deadline (its own timeout, then
  // the visibility reconciliation on return), and a manual Lock can land on
  // top of either. Without this, a straggler that was still draining while the
  // participant unlocked would go on to clear the DEK that unlock installed.
  const lockInFlight = useRef<Promise<void> | null>(null);
  const lock = useCallback(() => {
    lockInFlight.current ??= (async () => {
      try {
        // Only ever clear the key this lock was asked to clear. Coalescing
        // handles overlapping `lock` calls, but the cross-tab force-lock below
        // does not queue behind anything — it can lock mid-drain, and the
        // researcher can then unlock from the lock screen it raised. Reading
        // custody back afterwards catches that: a changed key (or one dropped
        // by someone else, leaving nothing to do) means this lock is stale.
        // The reference only moves via setSessionDek, and re-enrolment rewraps
        // the same DEK without calling it, so a PIN change can't misfire this.
        const keyToClear = getSessionDek();
        await runPreLockFlush();
        if (getSessionDek() !== keyToClear) return;
        await lockImmediately();
      } finally {
        lockInFlight.current = null;
      }
    })();
    return lockInFlight.current;
  }, [lockImmediately]);

  // The session DEK is per-tab module memory while the vault record is shared
  // localStorage. If another tab revokes and re-enrols, this tab's stale DEK
  // would encrypt rows the new vault can never decrypt (permanent data loss).
  // Force-lock this tab whenever the vault record changes in another tab so
  // AuthGate re-gates and the next unlock derives a fresh DEK. This is the one
  // path that must NOT flush first: writing under the stale DEK is precisely
  // the corruption this listener exists to prevent, and a revoke has already
  // deleted the database those writes would land in.
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
