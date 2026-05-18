import type { ReactNode } from 'react';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';

import { LockScreen } from './LockScreen';
import { SetupScreen } from './SetupScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { kind } = useAuth();

  if (kind === 'loading') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (kind === 'unconfigured') return <SetupScreen />;
  if (kind === 'locked') return <LockScreen />;
  return <>{children}</>;
}
