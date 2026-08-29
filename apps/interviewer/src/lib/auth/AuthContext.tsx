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
  // A lock is about one particular key, and both rules below follow from that.
  // It may only clear the key it was asked to clear, and it may only be shared
  // with another request asking to clear that same key.
  //
  // Sharing matters because the idle timer fires twice for a single deadline —
  // its own timeout, then the visibility reconciliation on return — with a
  // manual Lock able to land on top of either; without it, every registered
  // flush runs more than once and the vault stays open for the slowest.
  //
  // Keying that sharing on the DEK matters because the cross-tab force-lock
  // below does not queue behind a drain. It can lock mid-flush, and the
  // researcher can then unlock from the lock screen it raised, so by the time
  // a drain finishes the key it set out to clear may be gone or replaced. Such
  // a drain must do nothing — but a lock requested *after* that unlock is a
  // live request for the new key, and joining it to the doomed drain would
  // discard it and leave the vault open. Different key, different drain.
  //
  // The reference only moves via setSessionDek, and re-enrolment rewraps the
  // same DEK without calling it, so a PIN change can't misfire either rule.
  const lockInFlight = useRef<{
    key: CryptoKey | null;
    // Identity of the drain that published this entry. `run` cannot serve as
    // that identity: it is still being assigned while the drain body is
    // written, so the body cannot name it.
    token: object;
    run: Promise<void>;
  } | null>(null);
  const lock = useCallback(() => {
    const keyToClear = getSessionDek();
    const pending = lockInFlight.current;
    if (pending && pending.key === keyToClear) return pending.run;

    const token = {};
    const run = (async () => {
      try {
        await runPreLockFlush();
        if (getSessionDek() !== keyToClear) return;
        await lockImmediately();
      } finally {
        // Only retire our own entry: a newer request for a different key may
        // have replaced it while we drained.
        if (lockInFlight.current?.token === token) lockInFlight.current = null;
      }
    })();
    lockInFlight.current = { key: keyToClear, token, run };
    return run;
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
