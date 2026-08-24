import type { ComponentType } from 'react';

import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
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
      disabled={!type}
      disabledMessage="Select a node type above to configure this section."
      layout="vertical"
      title={!type ? 'Prompts' : undefined}
    >
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        hint="Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable handles on the left hand side."
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
