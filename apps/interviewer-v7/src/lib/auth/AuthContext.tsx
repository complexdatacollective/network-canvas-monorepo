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

export type AuthMode = 'webauthn' | 'pin' | 'none';

export type IdleTimeoutMinutes = 1 | 5 | 15 | 30 | 60;

export type AuthState = {
  kind: AuthStateKind;
  authenticatorSupported: boolean;
  mode?: AuthMode;
  credentialMetadata?: { credentialIdB64: string; enrolledAt: string };
  pinMetadata?: { enrolledAt: string };
  idleTimeoutMinutes: IdleTimeoutMinutes;
};

type AuthActions = {
  refresh: () => Promise<void>;
  enrolAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  enrolWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  enrolWithoutLock: () => Promise<{ ok: boolean; message?: string }>;
  unlockWithAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  unlockWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  lock: () => Promise<void>;
  reEnrol: (signal?: AbortSignal) => Promise<{ ok: boolean; message?: string }>;
  reEnrolWithPin: (args: {
    currentPin: string;
    nextPin: string;
  }) => Promise<{ ok: boolean; message?: string }>;
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
    const mode: AuthMode | undefined = s.mode ?? metadata?.mode;
    let credentialMetadata: AuthState['credentialMetadata'];
    let pinMetadata: AuthState['pinMetadata'];
    if (mode === 'webauthn') {
      const credentialIdB64 =
        metadata?.mode === 'webauthn'
          ? metadata.credentialIdB64
          : s.credentialIdB64;
      const enrolledAt =
        metadata?.mode === 'webauthn' ? metadata.enrolledAt : '';
      if (credentialIdB64) {
        credentialMetadata = { credentialIdB64, enrolledAt };
      }
    } else if (mode === 'pin') {
      pinMetadata = {
        enrolledAt: metadata?.mode === 'pin' ? metadata.enrolledAt : '',
      };
    }

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
      mode,
      credentialMetadata,
      pinMetadata,
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
    enabled: state.kind === 'unlocked' && state.mode !== 'none',
    onIdle: () => {
      void lock();
    },
    lockOnBlurMs: state.mode === 'none' ? null : BLUR_LOCK_DELAY_MS,
  });

  const enrolAuthenticator = useCallback(
    async (signal?: AbortSignal) => {
      const result = await authApi.enrol(signal);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const enrolWithPin = useCallback(
    async (pin: string) => {
      const result = await authApi.enrolWithPin(pin);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const enrolWithoutLock = useCallback(async () => {
    const result = await authApi.enrolWithoutLock();
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const unlockWithAuthenticator = useCallback(
    async (signal?: AbortSignal) => {
      const result = await authApi.unlock(signal);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const unlockWithPin = useCallback(
    async (pin: string) => {
      const result = await authApi.unlockWithPin(pin);
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

  const reEnrolWithPin = useCallback(
    async (args: { currentPin: string; nextPin: string }) => {
      const result = await authApi.reEnrolWithPin(args);
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
      enrolWithPin,
      enrolWithoutLock,
      unlockWithAuthenticator,
      unlockWithPin,
      lock,
      reEnrol,
      reEnrolWithPin,
      revoke,
      setIdleTimeoutMinutes,
    }),
    [
      state,
      refresh,
      enrolAuthenticator,
      enrolWithPin,
      enrolWithoutLock,
      unlockWithAuthenticator,
      unlockWithPin,
      lock,
      reEnrol,
      reEnrolWithPin,
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
