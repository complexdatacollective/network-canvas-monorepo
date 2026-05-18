import type { ReactNode } from 'react';

import { useAuth } from '~/lib/auth/AuthContext';

export function AuthGate({ children }: { children: ReactNode }) {
  // TEMP DEBUG: bypassing AuthGate so the deck can be tested in Chrome.
  useAuth();
  return <>{children}</>;
}
