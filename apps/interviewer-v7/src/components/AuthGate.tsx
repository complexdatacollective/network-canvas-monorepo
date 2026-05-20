import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';

import { LockScreen } from './LockScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { kind } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (kind === 'unconfigured' && location !== '/welcome') {
      navigate('/welcome', { replace: true });
    } else if (kind === 'unlocked' && location === '/welcome') {
      navigate('/', { replace: true });
    }
  }, [kind, location, navigate]);

  if (kind === 'loading') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (kind === 'locked') return <LockScreen />;

  return <>{children}</>;
}
