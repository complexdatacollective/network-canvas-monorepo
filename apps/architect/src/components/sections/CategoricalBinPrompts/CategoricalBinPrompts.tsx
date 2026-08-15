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
import { getOptionsForVariable } from '~/selectors/codebook';

// Imported from its own file rather than the `NameGeneratorPrompts` barrel
// index, which also re-exports the section component itself.
import PromptPreview from '../NameGeneratorPrompts/PromptPreview';
import PromptFields from './PromptFields';
import { useOnBeforeSavePrompt } from './useOnBeforeSavePrompt';

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

type Prompt = Record<string, unknown>;

/**
 * Enriches the row being edited with its variable's live codebook options
 * (mirroring the deleted `helpers.tsx` `itemSelector`), plus the row's
 * PRE-EDIT `variable`/`otherVariable` under distinct keys —
 * `useOnBeforeSavePrompt`'s unchanged-pick escape reads them from there,
 * since the new `DialogArrayField` no longer surfaces a dialog-form
 * `initialValues` prop separately from the row itself.
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

    return {
      ...prompt,
      variableOptions,
      _originalVariable: prompt.variable,
      _originalOtherVariable: prompt.otherVariable,
    };
  };

const CategoricalBinPrompts = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
  const onBeforeSave = useOnBeforeSavePrompt(entity, type);

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
        onBeforeSave={onBeforeSave}
        itemSelector={makeItemSelector(entity, type)}
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default CategoricalBinPrompts;
