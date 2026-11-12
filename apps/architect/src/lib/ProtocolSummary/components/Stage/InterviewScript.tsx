import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Markdown from '~/components/Markdown';

import SectionFrame from './SectionFrame';
const messages = defineMessages({
  interviewerScript: {
    id: 'architect.protocolSummary.stage.interviewScript.interviewerScript',
    defaultMessage: 'Interviewer Script',
    description:
      'Section heading in the printable protocol summary, above the notes that the researcher wrote for the interviewer to read aloud or follow on this stage.',
  },
});

type InterviewScriptProps = {
  interviewScript?: string | null;
};

const InterviewScript = ({ interviewScript = null }: InterviewScriptProps) => {
  const intl = useAppIntl();
  return (
    <SectionFrame
      title={intl.formatMessage(messages.interviewerScript)}
      wrapperClassName="break-inside-avoid"
      contentClassName="min-h-[25rem]"
    >
      {interviewScript && <Markdown label={interviewScript} />}
    </SectionFrame>
  );
};

export default InterviewScript;
