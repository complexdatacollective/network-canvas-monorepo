import { type ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';
import { isRunningInstalled } from '~/lib/pwa/isRunningInstalled';

import { LockScreen } from './LockScreen';
import { VaultRecoveryScreen } from './VaultRecoveryScreen';

export function AuthGate({ children }: { children: ReactNode }) {
  const { kind } = useAuth();
  const [location, navigate] = useLocation();

  // In a plain browser tab an unconfigured app is usable immediately in the
  // wizard-skipped ("none") mode — storage passes through unencrypted, which is
  // the intended not-yet-secured state, and InstallBanner urges installing
  // before collecting real data. Setup is only forced once the app is running
  // as an installed PWA, or the moment it becomes installed (see below).
  const [justInstalled, setJustInstalled] = useState(false);
  const requireSetup = isRunningInstalled() || justInstalled;

  // The `appinstalled` event fires once, right after the user installs the app
  // from a browser tab. Trigger setup immediately: flip the gate so the effect
  // below navigates to /welcome while still unconfigured. (The current tab does
  // not necessarily switch to standalone display-mode on install, so a local
  // flag — not a re-read of matchMedia — is what makes this reliable.)
  useEffect(() => {
    const onAppInstalled = () => setJustInstalled(true);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => window.removeEventListener('appinstalled', onAppInstalled);
  }, []);

  const shouldRedirectToWelcome =
    kind === 'unconfigured' && requireSetup && location !== '/welcome';
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

  if (kind === 'corrupt') return <VaultRecoveryScreen />;

  if (kind === 'locked') return <LockScreen />;

  return <>{children}</>;
}
