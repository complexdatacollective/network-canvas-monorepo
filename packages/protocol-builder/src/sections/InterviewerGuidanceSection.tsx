import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import RichTextField from '../fields/RichTextField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection, { type SectionCapability } from './BuilderSection.tsx';

const messages = defineMessages({
  title: {
    id: 'protocolBuilder.interviewerGuidance.title',
    defaultMessage: 'Interviewer guidance',
    description:
      'Heading of the section holding notes written for the person running the interview. Never shown to a participant.',
  },
  description: {
    id: 'protocolBuilder.interviewerGuidance.description',
    defaultMessage: 'Create notes or a guide for the interviewer.',
    description:
      'Description of the section holding notes written for the person running the interview.',
  },
  fieldLabel: {
    id: 'protocolBuilder.interviewerGuidance.fieldLabel',
    defaultMessage: 'Interviewer script text',
    description:
      'Label of the rich-text field holding the notes the person running the interview reads while this step runs.',
  },
  placeholder: {
    id: 'protocolBuilder.interviewerGuidance.placeholder',
    defaultMessage: 'Enter text for the interviewer here...',
    description:
      'Placeholder of the rich-text field holding the notes the person running the interview reads while this step runs.',
  },
  clearTitle: {
    id: 'protocolBuilder.interviewerGuidance.clearTitle',
    defaultMessage: 'This will clear your interview script',
    description:
      'Title of the confirmation asked before switching the interviewer guidance off, which throws away everything the researcher wrote in it.',
  },
  clearDescription: {
    id: 'protocolBuilder.interviewerGuidance.clearDescription',
    defaultMessage:
      'This will clear your interview script, and delete content you previously entered. Do you want to continue?',
    description:
      'Body of the confirmation asked before switching the interviewer guidance off, which throws away everything the researcher wrote in it.',
  },
  clearConfirm: {
    id: 'protocolBuilder.interviewerGuidance.clearConfirm',
    defaultMessage: 'Clear script',
    description:
      'Action that confirms switching the interviewer guidance off and discarding what was written in it.',
  },
});

const GUIDANCE_CAPABILITY: SectionCapability = {
  fields: ['interviewScript'],
  confirmClear: {
    title: messages.clearTitle,
    description: messages.clearDescription,
    confirmLabel: messages.clearConfirm,
  },
};

/**
 * Notes the interviewer reads while running this stage.
 *
 * Authoring guidance, not participant content: it is never rendered during the
 * interview itself. Optional, so it is a capability the researcher switches
 * on — and switching it off destroys what they wrote, which is why the switch
 * asks first.
 */
export default function InterviewerGuidanceSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      capability={GUIDANCE_CAPABILITY}
    >
      <ProtocolField
        name="interviewScript"
        component={RichTextField}
        label={intl.formatMessage(messages.fieldLabel)}
        placeholder={intl.formatMessage(messages.placeholder)}
      />
    </BuilderSection>
  );
}
