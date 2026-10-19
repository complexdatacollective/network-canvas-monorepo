import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import {
  INTERVIEWER_9_HOME_URL,
  leaveForInterviewer9,
} from '~/lib/handoff/interviewer9Navigation';

export const manageLockMessages = defineMessages({
  manageTheLockInInterviewer: {
    id: 'interviewer.manageLock.manageTheLockInInterviewer',
    defaultMessage: 'Manage the lock in Interviewer',
    description:
      'Button shown by Interviewer 8 when it runs inside the current Interviewer. It opens the current Interviewer, which is where the shared device lock (PIN, passphrase or biometrics) is set up, changed or reset. "Interviewer" is the app name.',
  },
  lockIsManagedInInterviewer: {
    id: 'interviewer.manageLock.lockIsManagedInInterviewer',
    defaultMessage:
      'Interviewer 8 uses the same lock as Interviewer. Set it up, change it or reset this device in Interviewer.',
    description:
      'Settings text shown by Interviewer 8 when it runs inside the current Interviewer, in place of the lock controls. "Interviewer 8" and "Interviewer" are app names.',
  },
});

// Interviewer 8 inside Interviewer 9's deploy (a /v8/ build) only unlocks the
// lock it shares with Interviewer 9. Setting it up, changing it, recovering
// from a forgotten PIN and resetting the device all happen in Interviewer 9,
// so each place that would offer one of those offers this instead.
export function ManageLockInInterviewerButton() {
  const intl = useAppIntl();
  return (
    <Button
      type="button"
      onClick={() => leaveForInterviewer9(INTERVIEWER_9_HOME_URL)}
    >
      {intl.formatMessage(manageLockMessages.manageTheLockInInterviewer)}
    </Button>
  );
}
