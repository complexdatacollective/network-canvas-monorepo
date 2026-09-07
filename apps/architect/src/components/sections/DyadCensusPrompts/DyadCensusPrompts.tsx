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
    id: 'architect.remaining.sections.dyadCensusPrompts.dyadCensusPrompts.editPrompt',
    defaultMessage: 'Edit Prompt',
    description:
      'The addTitle text in components / sections / DyadCensusPrompts / DyadCensusPrompts.',
  },
});
const additionalMessages = defineMessages({
  createNewPrompt: {
    id: 'architect.additional.sections.dyadCensusPrompts.dyadCensusPrompts.createNewPrompt',
    defaultMessage: 'Create new prompt',
    description:
      'The addButtonLabel text in components / sections / DyadCensusPrompts / DyadCensusPrompts.',
  },
});
const messages = defineMessages({
  promptCollection: {
    id: 'architect.sections.dyadCensusPrompts.dyadCensusPrompts.promptCollection',
    defaultMessage: 'Prompt collection',
    description:
      'The title text in components / sections / DyadCensusPrompts / DyadCensusPrompts.',
  },
  createAndReorderThePromptsShown: {
    id: 'architect.sections.dyadCensusPrompts.dyadCensusPrompts.createAndReorderThePromptsShown',
    defaultMessage: 'Create and reorder the prompts shown in this stage.',
    description:
      'The description text in components / sections / DyadCensusPrompts / DyadCensusPrompts.',
  },
  prompts: {
    id: 'architect.sections.dyadCensusPrompts.dyadCensusPrompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'The label text in components / sections / DyadCensusPrompts / DyadCensusPrompts.',
  },
  addAtLeastOnePromptAnd: {
    id: 'architect.sections.dyadCensusPrompts.dyadCensusPrompts.addAtLeastOnePromptAnd',
    defaultMessage: 'Add at least one prompt and drag prompts to reorder them.',
    description:
      'The hint text in components / sections / DyadCensusPrompts / DyadCensusPrompts.',
  },
});

type Prompt = Record<string, unknown>;

const DyadCensusPrompts = (_props: StageEditorSectionProps) => {
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

export default DyadCensusPrompts;
