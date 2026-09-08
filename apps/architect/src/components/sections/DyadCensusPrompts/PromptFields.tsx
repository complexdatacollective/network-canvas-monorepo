import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Section from '@codaco/fresco-ui/Section';
import RichText from '@codaco/protocol-builder/fields/RichTextField';
import ArchitectField from '~/components/Form/ArchitectField';

import { EntitySelectControl as EntitySelectField } from '../fields/EntitySelectField/EntitySelectField';
const messages = defineMessages({
  promptConfiguration: {
    id: 'architect.sections.dyadCensusPrompts.promptFields.promptConfiguration',
    defaultMessage: 'Prompt configuration',
    description:
      'The title text in components / sections / DyadCensusPrompts / PromptFields.',
  },
  writeTheParticipantPromptAndSelect: {
    id: 'architect.sections.dyadCensusPrompts.promptFields.writeTheParticipantPromptAndSelect',
    defaultMessage:
      'Write the participant prompt and select the edge type created by an affirmative response.',
    description:
      'The description text in components / sections / DyadCensusPrompts / PromptFields.',
  },
  rememberToWriteYourPromptText: {
    id: 'architect.sections.dyadCensusPrompts.promptFields.rememberToWriteYourPromptText',
    defaultMessage:
      "Remember to write your prompt text to take into account that the participant will be looking at pairs of prompts in sequence. Use phrases such as ' <strong>these people</strong> ', or ' <strong2>the two people shown</strong2> ' to indicate that the participant should focus on the visible pair.",
    description:
      'Visible text in components / sections / DyadCensusPrompts / PromptFields.',
  },
  youShouldAlsoPhraseYourPrompt: {
    id: 'architect.sections.dyadCensusPrompts.promptFields.youShouldAlsoPhraseYourPrompt',
    defaultMessage:
      "You should also phrase your prompt so that it can be answered with either a 'yes' or a 'no' by the participant, since these are the user-interface options that are shown.",
    description:
      'Visible text in components / sections / DyadCensusPrompts / PromptFields.',
  },
  promptText: {
    id: 'architect.sections.dyadCensusPrompts.promptFields.promptText',
    defaultMessage: 'Prompt text',
    description:
      'The label text in components / sections / DyadCensusPrompts / PromptFields.',
  },
  enterTextForThePromptHere: {
    id: 'architect.sections.dyadCensusPrompts.promptFields.enterTextForThePromptHere',
    defaultMessage: 'Enter text for the prompt here...',
    description:
      'The placeholder text in components / sections / DyadCensusPrompts / PromptFields.',
  },
  createdEdgeType: {
    id: 'architect.sections.dyadCensusPrompts.promptFields.createdEdgeType',
    defaultMessage: 'Created edge type',
    description:
      'The label text in components / sections / DyadCensusPrompts / PromptFields.',
  },
});

type PromptFieldsProps = {
  text?: string;
  createEdge?: string;
};

const PromptFields = ({ text, createEdge }: PromptFieldsProps) => {
  const intl = useAppIntl();
  return (
    <Section
      title={intl.formatMessage(messages.promptConfiguration)}
      description={intl.formatMessage(
        messages.writeTheParticipantPromptAndSelect,
      )}
    >
      <Alert variant="info" className="my-7">
        <AlertDescription className="space-y-4">
          <div>
            {intl.formatMessage(messages.rememberToWriteYourPromptText, {
              strong: (chunks) => <strong>{chunks}</strong>,
              strong2: (chunks) => <strong>{chunks}</strong>,
            })}
          </div>
          <div>
            {intl.formatMessage(messages.youShouldAlsoPhraseYourPrompt)}
          </div>
        </AlertDescription>
      </Alert>
      <ArchitectField
        name="text"
        label={intl.formatMessage(messages.promptText)}
        component={RichText}
        validation={{ required: true }}
        initialValue={text}
        singleLine
        placeholder={intl.formatMessage(messages.enterTextForThePromptHere)}
      />
      <ArchitectField
        name="createEdge"
        label={intl.formatMessage(messages.createdEdgeType)}
        component={EntitySelectField}
        validation={{ required: true }}
        initialValue={createEdge}
        entityType="edge"
      />
    </Section>
  );
};

export default PromptFields;
