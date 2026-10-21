import { type ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

import Spinner from '@codaco/fresco-ui/Spinner';
import { IS_SUBPATH_BUILD } from '~/lib/appBase';
import { useAuth } from '~/lib/auth/AuthContext';
import { returnToInterviewer9 } from '~/lib/interviewer9Navigation';
import { useStoredProtocolMigration } from '~/lib/protocol/useStoredProtocolMigration';
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

  // Interviewer 8 inside Interviewer 9 (a /v8/ build) shares Interviewer 9's
  // lock and never sets one up itself, and has no onboarding or Home of its
  // own: this gate only ever stands in front of an interview (App.tsx returns
  // every other address to Interviewer 9 before it). Where set-up is
  // required, the researcher belongs in Interviewer 9, which owns it and
  // forces it under the same rule. In a plain browser tab Interviewer 9 runs
  // without a lock, and so does this build: returning there would send every
  // way into Interviewer 8 straight back to Interviewer 9.
  const shouldReturnToInterviewer9 =
    IS_SUBPATH_BUILD && kind === 'unconfigured' && requireSetup;
  const shouldRedirectToWelcome =
    !IS_SUBPATH_BUILD &&
    kind === 'unconfigured' &&
    requireSetup &&
    location !== '/welcome';
  const shouldRedirectToHome =
    !IS_SUBPATH_BUILD && kind === 'unlocked' && location === '/welcome';

  // Protocol documents are encrypted at rest, so a stored protocol can only be
  // read — and therefore only be migrated to the schema version this build's
  // interview runtime executes — once the vault is open (or once it is known
  // there is no vault and rows are plaintext). This gate is the point where
  // that becomes true and, being the thing that admits every route, is also the
  // last point before a session could resume against a stale protocol. Hold the
  // same spinner the redirects use until the sweep settles; it finds nothing to
  // do on every library in the field today.
  //
  // Not in a /v8/ build: the database is Interviewer 9's, which keeps its
  // schema 8 protocols at schema 8, and that build writes nothing but its
  // interview's session row.
  const databaseReadable = kind === 'unlocked' || kind === 'unconfigured';
  const sweepsProtocols = !IS_SUBPATH_BUILD && databaseReadable;
  const migrationPhase = useStoredProtocolMigration(sweepsProtocols);
  const awaitingMigration = sweepsProtocols && migrationPhase !== 'settled';

  useEffect(() => {
    if (shouldReturnToInterviewer9) {
      returnToInterviewer9();
    } else if (shouldRedirectToWelcome) {
      navigate('/welcome', { replace: true });
    } else if (shouldRedirectToHome) {
      navigate('/', { replace: true });
    }
  }, [
    navigate,
    shouldReturnToInterviewer9,
    shouldRedirectToWelcome,
    shouldRedirectToHome,
  ]);

  // Hold the spinner while a redirect is pending so the old route's content
  // can't paint for a frame before navigation runs in the effect above.
  if (
    kind === 'loading' ||
    shouldReturnToInterviewer9 ||
    shouldRedirectToWelcome ||
    shouldRedirectToHome ||
    awaitingMigration
  ) {
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
