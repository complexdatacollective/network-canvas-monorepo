import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useAuth } from '~/lib/auth/AuthContext';
import {
  isInterviewRoutePath,
  persistInterviewRecoveryRestriction,
  readInterviewRecoveryRestriction,
} from '~/lib/auth/interviewRecoveryRestriction';

import { AuthenticationDialog } from './UnlockForms/AuthenticationDialog';

const messages = defineMessages({
  welcomeBack: {
    id: 'interviewer.lockScreen.welcomeBack',
    defaultMessage: 'Welcome back',
    description: 'The title label in Interviewer Lock Screen.',
  },
  authenticateToUnlockAndPickUpWhere: {
    id: 'interviewer.lockScreen.authenticateToUnlockAndPickUpWhere',
    defaultMessage: 'Authenticate to unlock and pick up where you left off.',
    description: 'The description label in Interviewer Lock Screen.',
  },
});

export function LockScreenView({
  allowDestructiveRecovery = true,
}: {
  allowDestructiveRecovery?: boolean;
}) {
  const intl = useAppIntl();
  return (
    <AuthenticationDialog
      title={intl.formatMessage(messages.welcomeBack)}
      description={intl.formatMessage(
        messages.authenticateToUnlockAndPickUpWhere,
      )}
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
