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
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import type { CrossClassPick } from '~/components/Validations/crossClassPicks';
import { getOptionsForVariable } from '~/selectors/codebook';

import { useCrossClassEditorValidate } from '../useCrossClassEditorValidate';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';
import {
  tieStrengthPromptSubject,
  useOnBeforeSaveTieStrengthPrompt,
} from './useOnBeforeSavePrompt';
const remainingMessages = defineMessages({
  editPrompt: {
    id: 'architect.remaining.sections.tieStrengthCensusPrompts.tieStrengthCensusPrompts.editPrompt',
    defaultMessage: 'Edit Prompt',
    description:
      'The addTitle text in components / sections / TieStrengthCensusPrompts / TieStrengthCensusPrompts.',
  },
});
const additionalMessages = defineMessages({
  createNewPrompt: {
    id: 'architect.additional.sections.tieStrengthCensusPrompts.tieStrengthCensusPrompts.createNewPrompt',
    defaultMessage: 'Create new prompt',
    description:
      'The addButtonLabel text in components / sections / TieStrengthCensusPrompts / TieStrengthCensusPrompts.',
  },
});
const messages = defineMessages({
  promptCollection: {
    id: 'architect.sections.tieStrengthCensusPrompts.tieStrengthCensusPrompts.promptCollection',
    defaultMessage: 'Prompt collection',
    description:
      'The title text in components / sections / TieStrengthCensusPrompts / TieStrengthCensusPrompts.',
  },
  createAndReorderThePromptsShown: {
    id: 'architect.sections.tieStrengthCensusPrompts.tieStrengthCensusPrompts.createAndReorderThePromptsShown',
    defaultMessage: 'Create and reorder the prompts shown in this stage.',
    description:
      'The description text in components / sections / TieStrengthCensusPrompts / TieStrengthCensusPrompts.',
  },
  prompts: {
    id: 'architect.sections.tieStrengthCensusPrompts.tieStrengthCensusPrompts.prompts',
    defaultMessage: 'Prompts',
    description:
      'The label text in components / sections / TieStrengthCensusPrompts / TieStrengthCensusPrompts.',
  },
  addAtLeastOnePromptAnd: {
    id: 'architect.sections.tieStrengthCensusPrompts.tieStrengthCensusPrompts.addAtLeastOnePromptAnd',
    defaultMessage: 'Add at least one prompt and drag prompts to reorder them.',
    description:
      'The hint text in components / sections / TieStrengthCensusPrompts / TieStrengthCensusPrompts.',
  },
});

type Prompt = Record<string, unknown>;

/**
 * Enriches the row being edited with its edge variable's live codebook
 * options (mirroring the deleted `helpers.tsx` `itemSelector`).
 */
const itemSelector: DialogArrayItemSelector = (state, { item }) => {
  const prompt = item as Prompt;
  const edgeVariable =
    typeof prompt.edgeVariable === 'string' ? prompt.edgeVariable : '';
  const variableOptions = getOptionsForVariable(state, {
    entity: 'edge',
    type: typeof prompt.createEdge === 'string' ? prompt.createEdge : undefined,
    variable: edgeVariable,
  });

  return { ...prompt, variableOptions };
};

/**
 * The census assigns its ordinal value as the participant answers, with no
 * validation of its own, so it is an UNVALIDATED writer of the edge variable.
 */
const PROMPT_PICKS = [
  { path: 'edgeVariable', writerClass: 'unvalidated' },
] as const satisfies readonly CrossClassPick[];

const TieStrengthCensusPrompts = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
  const onBeforeSave = useOnBeforeSaveTieStrengthPrompt();
  const editorValidate = useCrossClassEditorValidate({
    picks: PROMPT_PICKS,
    subjectForRow: tieStrengthPromptSubject,
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
        onBeforeSave={onBeforeSave}
        editorValidate={editorValidate}
        itemSelector={itemSelector}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default TieStrengthCensusPrompts;
