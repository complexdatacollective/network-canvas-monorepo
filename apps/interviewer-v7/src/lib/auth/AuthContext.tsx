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
import * as authApi from './api';
import { useIdleTimer } from './idle';
import * as vaultMetadata from './vaultMetadata';

export type AuthStateKind = 'loading' | 'unconfigured' | 'locked' | 'unlocked';

export type IdleTimeoutMinutes = 1 | 5 | 15 | 30 | 60;

export type AuthState = {
  kind: AuthStateKind;
  authenticatorSupported: boolean;
  credentialMetadata?: { credentialIdB64: string; enrolledAt: string };
  idleTimeoutMinutes: IdleTimeoutMinutes;
};

type AuthActions = {
  refresh: () => Promise<void>;
  enrolAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  unlockWithAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  lock: () => Promise<void>;
  reEnrol: (signal?: AbortSignal) => Promise<{ ok: boolean; message?: string }>;
  revoke: () => Promise<void>;
  setIdleTimeoutMinutes: (minutes: IdleTimeoutMinutes) => Promise<void>;
};

type AuthContextValue = AuthState & AuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

// Lock 30s after window blur / tab hide, separate from the per-user idle timeout —
// gives the user a brief grace period to alt-tab without losing their session.
// Disabled in dev (Vite/Capacitor live-reload), where the editor and devtools
// constantly steal focus and the lock fires before the developer returns to the tab.
const BLUR_LOCK_DELAY_MS = import.meta.env.DEV ? null : 30_000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    kind: 'loading',
    authenticatorSupported: false,
    idleTimeoutMinutes: DEFAULT_SETTINGS.idleTimeoutMinutes,
  });

  // Auth status must be read BEFORE any DB-backed call: on Electron the SQLCipher
  // service throws while the vault is locked, and loading settings first would
  // strand AuthGate in 'loading' on first launch.
  const refresh = useCallback(async () => {
    const authenticatorSupported = authApi.isAuthenticatorSupported();
    const s = await authApi.status();
    const kind: AuthStateKind = !s.configured
      ? 'unconfigured'
      : s.locked
        ? 'locked'
        : 'unlocked';

    const metadata = await vaultMetadata.read();
    const credentialMetadata = metadata
      ? {
          credentialIdB64: metadata.credentialIdB64,
          enrolledAt: metadata.enrolledAt,
        }
      : s.credentialIdB64
        ? { credentialIdB64: s.credentialIdB64, enrolledAt: '' }
        : undefined;

    let idleTimeoutMinutes: IdleTimeoutMinutes =
      DEFAULT_SETTINGS.idleTimeoutMinutes;
    if (kind === 'unlocked') {
      const settings = await getSettings();
      idleTimeoutMinutes =
        settings?.idleTimeoutMinutes ?? DEFAULT_SETTINGS.idleTimeoutMinutes;
    }

    setState({
      kind,
      authenticatorSupported,
      credentialMetadata,
      idleTimeoutMinutes,
    });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const lock = useCallback(async () => {
    await authApi.lock();
    await refresh();
  }, [refresh]);

  const idleTimeoutMs = state.idleTimeoutMinutes * 60_000;
  useIdleTimer({
    timeoutMs: idleTimeoutMs,
    enabled: state.kind === 'unlocked',
    onIdle: () => {
      void lock();
    },
    lockOnBlurMs: BLUR_LOCK_DELAY_MS,
  });

  const enrolAuthenticator = useCallback(
    async (signal?: AbortSignal) => {
      const result = await authApi.enrol(signal);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const unlockWithAuthenticator = useCallback(
    async (signal?: AbortSignal) => {
      const result = await authApi.unlock(signal);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const reEnrol = useCallback(
    async (signal?: AbortSignal) => {
      const result = await authApi.reEnrol(signal);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
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
      enrolAuthenticator,
      unlockWithAuthenticator,
      lock,
      reEnrol,
      revoke,
      setIdleTimeoutMinutes,
    }),
    [
      state,
      refresh,
      enrolAuthenticator,
      unlockWithAuthenticator,
      lock,
      reEnrol,
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
