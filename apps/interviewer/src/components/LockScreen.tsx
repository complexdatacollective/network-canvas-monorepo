import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';

import { useAuth } from '~/lib/auth/AuthContext';
import {
  isInterviewRoutePath,
  persistInterviewRecoveryRestriction,
  readInterviewRecoveryRestriction,
} from '~/lib/auth/interviewRecoveryRestriction';

import { AuthenticationDialog } from './UnlockForms/AuthenticationDialog';

export function LockScreenView({
  allowDestructiveRecovery = true,
}: {
  allowDestructiveRecovery?: boolean;
}) {
  return (
    <AuthenticationDialog
      title="Welcome back"
      description="Authenticate to unlock and pick up where you left off."
      allowRecovery
      allowDestructiveRecovery={allowDestructiveRecovery}
    />
  );
}

export function LockScreen() {
  const { kind } = useAuth();
  const [location] = useLocation();
  const interviewRoute = isInterviewRoutePath(location);
  const recoveryRestricted = useRef<boolean | undefined>(undefined);

  if (recoveryRestricted.current === undefined) {
    recoveryRestricted.current = readInterviewRecoveryRestriction();
  }

  if (kind === 'locked' && interviewRoute) {
    recoveryRestricted.current = true;
  }

  useEffect(() => {
    if (kind === 'locked' && interviewRoute) {
      persistInterviewRecoveryRestriction();
    }
  }, [interviewRoute, kind]);

  if (kind !== 'locked') {
    return null;
  }

  // Latch the restriction for this lock cycle so route changes cannot reveal
  // destructive recovery. The lock-specific marker preserves it across reloads.
  return (
    <LockScreenView allowDestructiveRecovery={!recoveryRestricted.current} />
  );
}
