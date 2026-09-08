import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';
const messages = defineMessages({
  participantPrompt: {
    id: 'architect.sections.promptText.participantPrompt',
    defaultMessage: 'Participant prompt',
    description: 'The title text in components / sections / PromptText.',
  },
  writeTheInstructionOrQuestionParticipants: {
    id: 'architect.sections.promptText.writeTheInstructionOrQuestionParticipants',
    defaultMessage:
      'Write the instruction or question participants see for this task.',
    description: 'The description text in components / sections / PromptText.',
  },
  promptText: {
    id: 'architect.sections.promptText.promptText',
    defaultMessage: 'Prompt text',
    description: 'The label text in components / sections / PromptText.',
  },
  enterYourPrompt: {
    id: 'architect.sections.promptText.enterYourPrompt',
    defaultMessage: 'Enter your prompt...',
    description: 'The placeholder text in components / sections / PromptText.',
  },
});

type PromptTextProps = {
  name?: string;
  /**
   * The prompt's committed text. This section is reused inside per-prompt
   * dialog editors (a different `FormStoreProvider` per row, not the stage
   * form), so it cannot resolve its own initial value from stage context —
   * the caller threads through whatever it already has (the stage's
   * `useStageInitialValue`, or the dialog's own edited item).
   */
  initialValue?: string;
};

const PromptText = ({ name = 'text', initialValue }: PromptTextProps) => {
  const intl = useAppIntl();
  return (
    <Section
      title={intl.formatMessage(messages.participantPrompt)}
      description={intl.formatMessage(
        messages.writeTheInstructionOrQuestionParticipants,
      )}
    >
      <ArchitectField
        name={name}
        component={RichText}
        singleLine
        label={intl.formatMessage(messages.promptText)}
        placeholder={intl.formatMessage(messages.enterYourPrompt)}
        validation={{ required: true }}
        initialValue={initialValue}
      />
    </Section>
  );
};
export default PromptText;
