import type { ComponentType } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';
const remainingMessages = defineMessages({
  editPrompt: {
    id: 'architect.remaining.sections.oneToManyDyadCensus.oneToManyDyadCensusPrompts.editPrompt',
    defaultMessage: 'Edit Prompt',
    description:
      'The addTitle text in components / sections / OneToManyDyadCensus / OneToManyDyadCensusPrompts.',
  },
});
const additionalMessages = defineMessages({
  createNewPrompt: {
    id: 'architect.additional.sections.oneToManyDyadCensus.oneToManyDyadCensusPrompts.createNewPrompt',
    defaultMessage: 'Create new prompt',
    description:
      'The addButtonLabel text in components / sections / OneToManyDyadCensus / OneToManyDyadCensusPrompts.',
  },
});
const messages = defineMessages({
  promptCollection: {
    id: 'architect.sections.oneToManyDyadCensus.oneToManyDyadCensusPrompts.promptCollection',
    defaultMessage: 'Prompt collection',
    description:
      'The title text in components / sections / OneToManyDyadCensus / OneToManyDyadCensusPrompts.',
  },
  createAndReorderThePromptsShown: {
    id: 'architect.sections.oneToManyDyadCensus.oneToManyDyadCensusPrompts.createAndReorderThePromptsShown',
    defaultMessage: 'Create and reorder the prompts shown in this stage.',
    description:
      'The description text in components / sections / OneToManyDyadCensus / OneToManyDyadCensusPrompts.',
  },
  prompts: {
    id: 'architect.sections.oneToManyDyadCensus.oneToManyDyadCensusPrompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'The label text in components / sections / OneToManyDyadCensus / OneToManyDyadCensusPrompts.',
  },
  addAtLeastOnePromptAnd: {
    id: 'architect.sections.oneToManyDyadCensus.oneToManyDyadCensusPrompts.addAtLeastOnePromptAnd',
    defaultMessage: 'Add at least one prompt and drag prompts to reorder them.',
    description:
      'The hint text in components / sections / OneToManyDyadCensus / OneToManyDyadCensusPrompts.',
  },
});

type Prompt = Record<string, unknown>;

const OneToManyDyadCensusPrompts = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');

  return (
    <Section
      title={intl.formatMessage(messages.promptCollection)}
      description={intl.formatMessage(messages.createAndReorderThePromptsShown)}
      disabled={!type}
    >
      <ArchitectArrayField
        name="prompts"
        label={intl.formatMessage(messages.prompts)}
        hint={intl.formatMessage(messages.addAtLeastOnePromptAnd)}
        component={DialogArrayField}
        addButtonLabel={intl.formatMessage(additionalMessages.createNewPrompt)}
        validation={{
          required: createMessageError(arrayValidationMessages.required),
        }}
        initialValue={initialPrompts}
        addTitle={intl.formatMessage(remainingMessages.editPrompt)}
        previewComponent={
          PromptPreview as ComponentType<Record<string, unknown>>
        }
        editorFieldsComponent={
          PromptFields as ComponentType<Record<string, unknown>>
        }
        editorTitle={intl.formatMessage(remainingMessages.editPrompt)}
        itemLabelMessage={arrayItemMessages.prompt}
        editorDialogSize="editor"
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default OneToManyDyadCensusPrompts;
