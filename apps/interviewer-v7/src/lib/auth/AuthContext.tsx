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

export type AuthMode =
  | 'biometric-keystore'
  | 'biometric-native'
  | 'pin'
  | 'passphrase'
  | 'none';

export type IdleTimeoutMinutes = 1 | 5 | 15 | 30 | 60;

export type AuthState = {
  kind: AuthStateKind;
  authenticatorSupported: boolean;
  mode?: AuthMode;
  biometricNativeMetadata?: { enrolledAt: string };
  pinMetadata?: { enrolledAt: string };
  passphraseMetadata?: { enrolledAt: string };
  idleTimeoutMinutes: IdleTimeoutMinutes;
};

type AuthActions = {
  refresh: () => Promise<void>;
  enrolAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  enrolWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  enrolWithoutLock: () => Promise<{ ok: boolean; message?: string }>;
  enrolWithBiometricNative: () => Promise<{ ok: boolean; message?: string }>;
  enrolWithPassphrase: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  unlockWithAuthenticator: (
    signal?: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string }>;
  unlockWithPin: (pin: string) => Promise<{ ok: boolean; message?: string }>;
  unlockWithBiometricNative: () => Promise<{ ok: boolean; message?: string }>;
  unlockWithPassphrase: (
    phrase: string,
  ) => Promise<{ ok: boolean; message?: string }>;
  lock: () => Promise<void>;
  reEnrol: (signal?: AbortSignal) => Promise<{ ok: boolean; message?: string }>;
  reEnrolWithPin: (args: {
    currentPin: string;
    nextPin: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  reEnrolWithPassphrase: (args: {
    currentPhrase: string;
    nextPhrase: string;
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
    const authenticatorSupported = await authApi.isBiometricSupported();
    const s = await authApi.status();
    const kind: AuthStateKind = !s.configured
      ? 'unconfigured'
      : s.locked
        ? 'locked'
        : 'unlocked';

    const metadata = await vaultMetadata.read();
    const mode: AuthMode | undefined = s.mode ?? metadata?.mode;
    let biometricNativeMetadata: AuthState['biometricNativeMetadata'];
    let pinMetadata: AuthState['pinMetadata'];
    let passphraseMetadata: AuthState['passphraseMetadata'];
    if (mode === 'pin') {
      pinMetadata = {
        enrolledAt: metadata?.mode === 'pin' ? metadata.enrolledAt : '',
      };
    } else if (mode === 'passphrase') {
      passphraseMetadata = {
        enrolledAt: metadata?.mode === 'passphrase' ? metadata.enrolledAt : '',
      };
    } else if (mode === 'biometric-native') {
      biometricNativeMetadata = {
        enrolledAt:
          metadata?.mode === 'biometric-native' ? metadata.enrolledAt : '',
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
      biometricNativeMetadata,
      pinMetadata,
      passphraseMetadata,
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

  const enrolWithBiometricNative = useCallback(async () => {
    const result = await authApi.enrolWithBiometricNative();
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const enrolWithPassphrase = useCallback(
    async (phrase: string) => {
      const result = await authApi.enrolWithPassphrase(phrase);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const unlockWithBiometricNative = useCallback(async () => {
    const result = await authApi.unlockWithBiometricNative();
    if (result.ok) await refresh();
    return result;
  }, [refresh]);

  const unlockWithPassphrase = useCallback(
    async (phrase: string) => {
      const result = await authApi.unlockWithPassphrase(phrase);
      if (result.ok) await refresh();
      return result;
    },
    [refresh],
  );

  const reEnrolWithPassphrase = useCallback(
    async (args: { currentPhrase: string; nextPhrase: string }) => {
      const result = await authApi.reEnrolWithPassphrase(args);
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
      enrolWithBiometricNative,
      enrolWithPassphrase,
      unlockWithAuthenticator,
      unlockWithPin,
      unlockWithBiometricNative,
      unlockWithPassphrase,
      lock,
      reEnrol,
      reEnrolWithPin,
      reEnrolWithPassphrase,
      revoke,
      setIdleTimeoutMinutes,
    }),
    [
      state,
      refresh,
      enrolAuthenticator,
      enrolWithPin,
      enrolWithoutLock,
      enrolWithBiometricNative,
      enrolWithPassphrase,
      unlockWithAuthenticator,
      unlockWithPin,
      unlockWithBiometricNative,
      unlockWithPassphrase,
      lock,
      reEnrol,
      reEnrolWithPin,
      reEnrolWithPassphrase,
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
