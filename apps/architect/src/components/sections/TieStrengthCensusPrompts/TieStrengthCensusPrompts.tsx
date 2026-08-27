import type { ComponentType } from 'react';

import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
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
  const { type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
  const onBeforeSave = useOnBeforeSaveTieStrengthPrompt();
  const editorValidate = useCrossClassEditorValidate({
    picks: PROMPT_PICKS,
    subjectForRow: tieStrengthPromptSubject,
  });

  return (
    <Section
      title="Prompt collection"
      description="Create and reorder the prompts shown in this stage."
      disabled={!type}
    >
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        hint="Add at least one prompt and drag prompts to reorder them."
        component={DialogArrayField}
        addButtonLabel="Create new prompt"
        validation={{ required: 'You must create at least one item.' }}
        initialValue={initialPrompts}
        addTitle="Edit Prompt"
        previewComponent={
          PromptPreview as ComponentType<Record<string, unknown>>
        }
        editorFieldsComponent={
          PromptFields as ComponentType<Record<string, unknown>>
        }
        editorTitle="Edit Prompt"
        itemLabel="prompt"
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
