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
  useStageFormValue,
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

// Imported from its own file rather than the `NameGeneratorPrompts` barrel
// index, which also re-exports the section component itself.
import PromptFields from '../NameGeneratorPrompts/PromptFields';
import PromptPreview from '../NameGeneratorPrompts/PromptPreview';
const remainingMessages = defineMessages({
  editPrompt: {
    id: 'architect.remaining.sections.nameGeneratorRosterPrompts.nameGeneratorRosterPrompts.editPrompt',
    defaultMessage: 'Edit Prompt',
    description:
      'The addTitle text in components / sections / NameGeneratorRosterPrompts / NameGeneratorRosterPrompts.',
  },
});
const additionalMessages = defineMessages({
  createNewPrompt: {
    id: 'architect.additional.sections.nameGeneratorRosterPrompts.nameGeneratorRosterPrompts.createNewPrompt',
    defaultMessage: 'Create new prompt',
    description:
      'The addButtonLabel text in components / sections / NameGeneratorRosterPrompts / NameGeneratorRosterPrompts.',
  },
});
const messages = defineMessages({
  promptCollection: {
    id: 'architect.sections.nameGeneratorRosterPrompts.nameGeneratorRosterPrompts.promptCollection',
    defaultMessage: 'Prompt collection',
    description:
      'The title text in components / sections / NameGeneratorRosterPrompts / NameGeneratorRosterPrompts.',
  },
  createAndReorderThePromptsShown: {
    id: 'architect.sections.nameGeneratorRosterPrompts.nameGeneratorRosterPrompts.createAndReorderThePromptsShown',
    defaultMessage: 'Create and reorder the prompts shown in this stage.',
    description:
      'The description text in components / sections / NameGeneratorRosterPrompts / NameGeneratorRosterPrompts.',
  },
  prompts: {
    id: 'architect.sections.nameGeneratorRosterPrompts.nameGeneratorRosterPrompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'The label text in components / sections / NameGeneratorRosterPrompts / NameGeneratorRosterPrompts.',
  },
  addAtLeastOnePromptAnd: {
    id: 'architect.sections.nameGeneratorRosterPrompts.nameGeneratorRosterPrompts.addAtLeastOnePromptAnd',
    defaultMessage: 'Add at least one prompt and drag prompts to reorder them.',
    description:
      'The hint text in components / sections / NameGeneratorRosterPrompts / NameGeneratorRosterPrompts.',
  },
});

type Prompt = Record<string, unknown>;

const NameGeneratorRosterPrompts = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { entity, type } = useSubject();
  const dataSource = useStageFormValue<string>('dataSource');
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');

  return (
    <Section
      title={intl.formatMessage(messages.promptCollection)}
      description={intl.formatMessage(messages.createAndReorderThePromptsShown)}
      disabled={!dataSource}
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
        // No `currentStageIndex`: this section never supplied one, so the
        // additional-attributes pool keeps excluding this stage's own
        // committed roles exactly as before.
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default NameGeneratorRosterPrompts;
