import type { ComponentType } from 'react';

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

// Imported from its own file rather than the `NameGeneratorPrompts` barrel
// index, which also re-exports the section component itself.
import PromptPreview from '../NameGeneratorPrompts/PromptPreview';
import { useCrossClassEditorValidate } from '../useCrossClassEditorValidate';
import PromptFields from './PromptFields';
import { useOnBeforeSavePrompt } from './useOnBeforeSavePrompt';

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

type Prompt = Record<string, unknown>;

/**
 * Enriches the row being edited with its variable's live codebook options
 * (mirroring the deleted `helpers.tsx` `itemSelector`).
 */
const makeItemSelector =
  (entity: string | null, type: string | null): DialogArrayItemSelector =>
  (state, { item }) => {
    const prompt = item as Prompt;
    const variable = typeof prompt.variable === 'string' ? prompt.variable : '';
    const variableOptions = getOptionsForVariable(state, {
      entity: (entity ?? 'node') as 'node' | 'edge' | 'ego',
      type: type ?? undefined,
      variable,
    });

    return { ...prompt, variableOptions };
  };

/**
 * The bin itself writes through drag-and-drop, with no validation of its own;
 * the follow-up "other" attribute is collected through an input that honours
 * that variable's codebook validation. Opposite classes, so their gates check
 * opposite directions.
 */
const PROMPT_PICKS = [
  { path: 'variable', writerClass: 'unvalidated' },
  { path: 'otherVariable', writerClass: 'validated' },
] as const satisfies readonly CrossClassPick[];

const CategoricalBinPrompts = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
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
    >
      <ArchitectArrayField
        name="prompts"
        label="Prompts"
        hint="Add one or more prompts below to frame the task for the user. You can reorder the prompts using the draggable handles on the left hand side."
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
        itemSelector={makeItemSelector(entity, type)}
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default CategoricalBinPrompts;
