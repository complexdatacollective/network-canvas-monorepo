import type { ComponentType } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
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

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

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
      disabled={!type}
      disabledMessage="Select a node type above to configure this section."
      summary={
        <Paragraph>
          Add one or more prompts below to frame the task for the user. You can
          reorder the prompts using the draggable handles on the left hand side.
        </Paragraph>
      }
      title="Prompts"
    >
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        labelHidden
        component={DialogArrayField}
        addButtonLabel="Create new prompt"
        validation={{ notEmpty }}
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
