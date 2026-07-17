import { useLayoutEffect, useState } from 'react';
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
  const [recoveryRestricted, setRecoveryRestricted] = useState(
    readInterviewRecoveryRestriction,
  );

  useLayoutEffect(() => {
    if (kind !== 'locked') {
      setRecoveryRestricted(false);
      return;
    }

    if (kind === 'locked' && interviewRoute) {
      setRecoveryRestricted(true);
      persistInterviewRecoveryRestriction();
    }
  }, [interviewRoute, kind]);

  if (kind !== 'locked') {
    return null;
  }

  // Latch the restriction for this lock cycle so route changes cannot reveal
  // destructive recovery. The lock-specific marker preserves it across reloads.
  return (
    <LockScreenView
      allowDestructiveRecovery={!(recoveryRestricted || interviewRoute)}
    />
  );
}
