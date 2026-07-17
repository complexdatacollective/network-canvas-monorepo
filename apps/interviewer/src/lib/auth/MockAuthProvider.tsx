import type { ReactNode } from 'react';

import { AuthContext, type AuthContextValue } from './AuthContext';

const ok = async () => ({ ok: true }) as const;

const DEFAULT_VALUE: AuthContextValue = {
  kind: 'locked',
  idleTimeoutMinutes: 5,
  refresh: async () => undefined,
  enrolWithoutLock: ok,
  enrolWithPin: ok,
  enrolWithPassphrase: ok,
  enrolWithBiometric: ok,
  unlockWithPin: ok,
  unlockWithPassphrase: ok,
  unlockWithBiometric: ok,
  unlockWithRecovery: ok,
  verifyWithPin: ok,
  verifyWithPassphrase: ok,
  verifyBiometric: ok,
  verifyWithRecovery: ok,
  reEnrolWithPin: ok,
  reEnrolWithPassphrase: ok,
  lock: async () => undefined,
  revoke: async () => undefined,
  setIdleTimeoutMinutes: async () => undefined,
};

// A dependency-free AuthContext for Storybook. The app's real AuthProvider
// touches the platform DB, so the global storybook decorator omits it; auth-
// consuming presentational components (e.g. the lock bodies' reset affordance)
// wrap themselves in this stub instead.
export function MockAuthProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Partial<AuthContextValue>;
}) {
  return (
    <AuthContext.Provider value={{ ...DEFAULT_VALUE, ...value }}>
      {children}
    </AuthContext.Provider>
  );
}
