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
  const locked = kind === 'locked';
  // Seeded from the lock-specific marker so a reload during a restricted lock
  // cycle stays restricted; mounting unlocked starts clean, because the marker
  // is cleared on the way out of a lock cycle.
  const [recoveryRestricted, setRecoveryRestricted] = useState(
    () => locked && readInterviewRecoveryRestriction(),
  );
  const [wasLocked, setWasLocked] = useState(locked);

  // Adjusted during render rather than in an effect so the restriction is part
  // of the first committed frame: the latch is derived from the lock cycle and
  // the route, not synchronised with anything outside React.
  if (wasLocked !== locked) {
    setWasLocked(locked);
    if (!locked) {
      setRecoveryRestricted(false);
    }
  }
  if (locked && interviewRoute && !recoveryRestricted) {
    setRecoveryRestricted(true);
  }

  // Writing the marker is a side effect on sessionStorage, so it stays in an
  // effect — layout-phase so a reload mid-cycle can never observe the lock
  // screen painted without it.
  useLayoutEffect(() => {
    if (locked && interviewRoute) {
      persistInterviewRecoveryRestriction();
    }
  }, [interviewRoute, locked]);

  if (!locked) {
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
