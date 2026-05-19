import { type ReactNode, useEffect, useRef } from 'react';

import Spinner from '@codaco/fresco-ui/Spinner';
import { useAuth } from '~/lib/auth/AuthContext';

import { LockScreen } from './LockScreen';
import { useSetupWizard } from './SetupWizardDialog';

export function AuthGate({ children }: { children: ReactNode }) {
  const { kind } = useAuth();
  const { openSetupWizard } = useSetupWizard();
  const openedRef = useRef(false);

  useEffect(() => {
    if (kind === 'unconfigured' && !openedRef.current) {
      openedRef.current = true;
      void openSetupWizard().finally(() => {
        openedRef.current = false;
      });
    }
  }, [kind, openSetupWizard]);

  if (kind === 'loading') {
    return (
      <div className="bg-background flex min-h-dvh items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (kind === 'unconfigured') {
    // The wizard dialog mounts above this content via DialogProvider.
    // Render an empty placeholder so the global background blobs (rendered by
    // App.tsx) are the only visual underneath the dialog.
    return <div className="min-h-dvh" aria-hidden />;
  }

  if (kind === 'locked') return <LockScreen />;

  return <>{children}</>;
}
