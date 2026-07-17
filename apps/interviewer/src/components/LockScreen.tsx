import { useAuth } from '~/lib/auth/AuthContext';

import { AuthenticationDialog } from './UnlockForms/AuthenticationDialog';

export function LockScreenView() {
  return (
    <AuthenticationDialog
      title="Welcome back"
      description="Authenticate to unlock and pick up where you left off."
      allowRecovery
    />
  );
}

export function LockScreen() {
  const { kind } = useAuth();

  if (kind !== 'locked') {
    return null;
  }

  return <LockScreenView />;
}
