import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

const messages = defineMessages({
  interviewComplete: {
    id: 'interviewer.interviewComplete.interviewComplete',
    defaultMessage: 'Interview complete',
    description: 'Visible copy in Interviewer Interview Complete.',
  },
  thankYouThisInterviewIsFinishedAnd: {
    id: 'interviewer.interviewComplete.thankYouThisInterviewIsFinishedAnd',
    defaultMessage:
      'Thank you. This interview is finished and its responses can no longer be changed. Please hand the device back to the researcher.',
    description: 'Visible copy in Interviewer Interview Complete.',
  },
  exit: {
    id: 'interviewer.interviewComplete.exit',
    defaultMessage: 'Exit',
    description:
      'Participant completion-screen action handing control back to the researcher, with authentication if required.',
  },
});

export function InterviewComplete({ onExit }: { onExit: () => void }) {
  const intl = useAppIntl();
  return (
    <div
      className="mx-auto flex h-full w-full max-w-lg items-center justify-center p-8"
      data-testid="interview-complete"
    >
      <Surface
        floating
        spacing="lg"
        shadow="lg"
        className="flex flex-col items-center gap-4 text-center"
      >
        <Heading level="h1">
          {intl.formatMessage(messages.interviewComplete)}
        </Heading>
        <Paragraph>
          {intl.formatMessage(messages.thankYouThisInterviewIsFinishedAnd)}
        </Paragraph>
        <Button onClick={onExit} data-testid="interview-complete-exit">
          {intl.formatMessage(messages.exit)}
        </Button>
      </Surface>
    </div>
  );
}
