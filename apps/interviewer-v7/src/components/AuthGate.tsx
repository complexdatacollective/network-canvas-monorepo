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
    if (kind !== 'unconfigured' || openedRef.current) return;
    openedRef.current = true;
    // Defer to a microtask so we don't trigger fresco-ui's flushSync during the
    // passive-effect commit phase. Calling openDialog synchronously here makes
    // React complain that flushSync was called from inside a lifecycle method.
    queueMicrotask(() => {
      void openSetupWizard().finally(() => {
        openedRef.current = false;
      });
    });
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
