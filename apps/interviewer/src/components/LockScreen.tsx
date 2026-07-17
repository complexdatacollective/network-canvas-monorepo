import { useRef } from 'react';
import { useLocation } from 'wouter';

import { useAuth } from '~/lib/auth/AuthContext';
import { useStepUpAuth } from '~/lib/auth/StepUpAuthProvider';

import { AuthenticationDialog } from './UnlockForms/AuthenticationDialog';

export function LockScreenView({
  allowRecovery = true,
}: {
  allowRecovery?: boolean;
}) {
  return (
    <AuthenticationDialog
      title="Welcome back"
      description="Authenticate to unlock and pick up where you left off."
      allowRecovery={allowRecovery}
    />
  );
}

export function LockScreen() {
  const { kind } = useAuth();
  const { getAuthorizedInterviewId } = useStepUpAuth();
  const [location] = useLocation();
  const recoveryRestricted = useRef(
    /^\/interview\//i.test(location) || getAuthorizedInterviewId() !== null,
  );

  if (kind !== 'locked') {
    return null;
  }

  // Never expose destructive recovery while an interview is protected. Latch
  // the restriction for this lock cycle so Back/URL changes cannot reveal it;
  // the persisted interview authorization keeps it restricted across reloads.
  return <LockScreenView allowRecovery={!recoveryRestricted.current} />;
}
