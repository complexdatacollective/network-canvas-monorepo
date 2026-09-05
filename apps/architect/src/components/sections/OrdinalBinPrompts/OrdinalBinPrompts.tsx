import type { ComponentType } from 'react';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import type { DialogArrayItemSelector } from '~/components/Form/arrayFields/DialogArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import { useOnBeforeSavePrompt } from '~/components/sections/CategoricalBinPrompts/useOnBeforeSavePrompt';
import PromptPreview from '~/components/sections/NameGeneratorPrompts/PromptPreview';
import { useCrossClassEditorValidate } from '~/components/sections/useCrossClassEditorValidate';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import type { CrossClassPick } from '~/components/Validations/crossClassPicks';
import { getOptionsForVariable } from '~/selectors/codebook';

import PromptFields from './PromptFields';
const remainingMessages = defineMessages({
  editPrompt: {
    id: 'architect.remaining.sections.ordinalBinPrompts.ordinalBinPrompts.editPrompt',
    defaultMessage: 'Edit Prompt',
    description:
      'The addTitle text in components / sections / OrdinalBinPrompts / OrdinalBinPrompts.',
  },
});
const additionalMessages = defineMessages({
  createNewPrompt: {
    id: 'architect.additional.sections.ordinalBinPrompts.ordinalBinPrompts.createNewPrompt',
    defaultMessage: 'Create new prompt',
    description:
      'The addButtonLabel text in components / sections / OrdinalBinPrompts / OrdinalBinPrompts.',
  },
});
const messages = defineMessages({
  promptCollection: {
    id: 'architect.sections.ordinalBinPrompts.ordinalBinPrompts.promptCollection',
    defaultMessage: 'Prompt collection',
    description:
      'The title text in components / sections / OrdinalBinPrompts / OrdinalBinPrompts.',
  },
  createAndReorderThePromptsShown: {
    id: 'architect.sections.ordinalBinPrompts.ordinalBinPrompts.createAndReorderThePromptsShown',
    defaultMessage: 'Create and reorder the prompts shown in this stage.',
    description:
      'The description text in components / sections / OrdinalBinPrompts / OrdinalBinPrompts.',
  },
  prompts: {
    id: 'architect.sections.ordinalBinPrompts.ordinalBinPrompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'The label text in components / sections / OrdinalBinPrompts / OrdinalBinPrompts.',
  },
  addAtLeastOnePromptAnd: {
    id: 'architect.sections.ordinalBinPrompts.ordinalBinPrompts.addAtLeastOnePromptAnd',
    defaultMessage: 'Add at least one prompt and drag prompts to reorder them.',
    description:
      'The hint text in components / sections / OrdinalBinPrompts / OrdinalBinPrompts.',
  },
});

const template = () => ({ color: 'ord-color-seq-1' });

type Prompt = Record<string, unknown>;

/**
 * Enriches the row being edited with its variable's live codebook options
 * (the deleted `CategoricalBinPrompts/helpers.tsx` `itemSelector`).
 */
const makeItemSelector =
  (
    entity: 'node' | 'edge' | 'ego',
    type: string | null,
  ): DialogArrayItemSelector =>
  (state, { item }) => {
    const prompt = item as Prompt;
    const variable = typeof prompt.variable === 'string' ? prompt.variable : '';
    const variableOptions = getOptionsForVariable(state, {
      entity,
      type: type ?? undefined,
      variable,
    });

    return { ...prompt, variableOptions };
  };

/**
 * An ordinal bin writes through drag-and-drop, with no validation of its own.
 * Unlike CategoricalBin it has no follow-up "other" attribute, so it declares
 * no VALIDATED pick.
 */
const PROMPT_PICKS = [
  { path: 'variable', writerClass: 'unvalidated' },
] as const satisfies readonly CrossClassPick[];

const OrdinalBinPrompts = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
  // Shared verbatim with CategoricalBin (as the `withPromptChangeHandler` HOC
  // it replaces was): both bins commit an option list against the stage's own
  // subject in exactly the same way.
  const onBeforeSave = useOnBeforeSavePrompt(entity, type);
  const editorValidate = useCrossClassEditorValidate({
    picks: PROMPT_PICKS,
    subjectForRow: () => (type ? { entity, type } : null),
  });

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
        itemTemplate={template}
        onBeforeSave={onBeforeSave}
        editorValidate={editorValidate}
        itemSelector={makeItemSelector(entity, type)}
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default OrdinalBinPrompts;
