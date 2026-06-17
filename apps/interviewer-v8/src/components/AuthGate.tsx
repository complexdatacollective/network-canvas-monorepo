import { type ReactNode, useEffect } from 'react';
import { useLocation } from 'wouter';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';

import { LockScreen } from './LockScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { kind } = useAuth();
  const [location, navigate] = useLocation();

  const shouldRedirectToWelcome =
    kind === 'unconfigured' && location !== '/welcome';
  const shouldRedirectToHome = kind === 'unlocked' && location === '/welcome';

  useEffect(() => {
    if (shouldRedirectToWelcome) {
      navigate('/welcome', { replace: true });
    } else if (shouldRedirectToHome) {
      navigate('/', { replace: true });
    }
  }, [navigate, shouldRedirectToWelcome, shouldRedirectToHome]);

  // Hold the spinner while a redirect is pending so the old route's content
  // can't paint for a frame before navigation runs in the effect above.
  if (kind === 'loading' || shouldRedirectToWelcome || shouldRedirectToHome) {
    return (
      <div className="bg-background flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (kind === 'locked') return <LockScreen />;

  return <>{children}</>;
}
