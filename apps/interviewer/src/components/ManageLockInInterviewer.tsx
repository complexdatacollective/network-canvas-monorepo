import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import { returnToInterviewer9 } from '~/lib/interviewer9Navigation';

const messages = defineMessages({
  manageTheLockInInterviewer: {
    id: 'interviewer.manageLock.manageTheLockInInterviewer',
    defaultMessage: 'Manage the lock in Interviewer',
    description:
      'Button shown by Interviewer 8 when it runs inside the current Interviewer. It opens the current Interviewer, which is where the shared device lock (PIN, passphrase or biometrics) is set up, changed or reset. "Interviewer" is the app name.',
  },
});

// Interviewer 8 inside Interviewer 9's deploy (a /v8/ build) only unlocks the
// lock it shares with Interviewer 9. Setting it up, changing it, recovering
// from a forgotten PIN and resetting the device all happen in Interviewer 9,
// so each place that would offer one of those (the lock screen, the vault
// recovery screen) offers this instead. Framed by Interviewer 9, as this
// build always runs, it ends the interview here and leaves the researcher in
// Interviewer 9.
export function ManageLockInInterviewerButton() {
  const intl = useAppIntl();
  return (
    <Button type="button" onClick={returnToInterviewer9}>
      {intl.formatMessage(messages.manageTheLockInInterviewer)}
    </Button>
  );
}
