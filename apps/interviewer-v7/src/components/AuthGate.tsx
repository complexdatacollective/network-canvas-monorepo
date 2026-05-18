import type { ReactNode } from 'react';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';

import { LockScreen } from './LockScreen';
import { SetupScreen } from './SetupScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  // TEMP DEBUG: bypassing AuthGate so the deck can be tested in Chrome.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _auth = useAuth();
  return <>{children}</>;
}
