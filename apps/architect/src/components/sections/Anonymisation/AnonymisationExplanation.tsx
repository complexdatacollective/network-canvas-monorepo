import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
const messages = defineMessages({
  taskExplanation: {
    id: 'architect.sections.anonymisation.anonymisationExplanation.taskExplanation',
    defaultMessage: 'Task explanation',
    description:
      'The title text in components / sections / Anonymisation / AnonymisationExplanation.',
  },
  explainTheAnonymisationProcessToParticipants: {
    id: 'architect.sections.anonymisation.anonymisationExplanation.explainTheAnonymisationProcessToParticipants',
    defaultMessage:
      'Explain the anonymisation process to participants before they enter their passphrase.',
    description:
      'The description text in components / sections / Anonymisation / AnonymisationExplanation.',
  },
  title: {
    id: 'architect.sections.anonymisation.anonymisationExplanation.title',
    defaultMessage: 'Title',
    description:
      'The label text in components / sections / Anonymisation / AnonymisationExplanation.',
  },
  thisInterviewUsesEnhancedPrivacyProtection: {
    id: 'architect.sections.anonymisation.anonymisationExplanation.thisInterviewUsesEnhancedPrivacyProtection',
    defaultMessage: 'This interview uses enhanced privacy protection',
    description:
      'The placeholder text in components / sections / Anonymisation / AnonymisationExplanation.',
  },
  body: {
    id: 'architect.sections.anonymisation.anonymisationExplanation.body',
    defaultMessage: 'Body',
    description:
      'The label text in components / sections / Anonymisation / AnonymisationExplanation.',
  },
  enterYourPassphraseBelowAndClick: {
    id: 'architect.sections.anonymisation.anonymisationExplanation.enterYourPassphraseBelowAndClick',
    defaultMessage:
      "Enter your passphrase below, and click the 'continue' button.",
    description:
      'The placeholder text in components / sections / Anonymisation / AnonymisationExplanation.',
  },
});

const AnonymisationExplanation = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const titleInitialValue = useStageInitialValue<string>(
    'explanationText.title',
  );
  const bodyInitialValue = useStageInitialValue<string>('explanationText.body');

  return (
    <Section
      title={intl.formatMessage(messages.taskExplanation)}
      description={intl.formatMessage(
        messages.explainTheAnonymisationProcessToParticipants,
      )}
    >
      <ArchitectField
        name="explanationText.title"
        label={intl.formatMessage(messages.title)}
        component={InputField}
        validation={{ required: true, maxLength: 50 }}
        initialValue={titleInitialValue}
        placeholder={intl.formatMessage(
          messages.thisInterviewUsesEnhancedPrivacyProtection,
        )}
      />
      <ArchitectField
        name="explanationText.body"
        label={intl.formatMessage(messages.body)}
        component={RichText}
        validation={{ required: true }}
        initialValue={bodyInitialValue}
        placeholder={intl.formatMessage(
          messages.enterYourPassphraseBelowAndClick,
        )}
      />
    </Section>
  );
};
export default AnonymisationExplanation;
