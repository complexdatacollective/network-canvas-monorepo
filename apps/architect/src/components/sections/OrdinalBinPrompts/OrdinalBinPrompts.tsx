import type { ComponentType } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import type { DialogArrayItemSelector } from '~/components/Form/arrayFields/DialogArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import { useOnBeforeSavePrompt } from '~/components/sections/CategoricalBinPrompts/useOnBeforeSavePrompt';
import PromptPreview from '~/components/sections/NameGeneratorPrompts/PromptPreview';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';
import { getOptionsForVariable } from '~/selectors/codebook';

import PromptFields from './PromptFields';

const template = () => ({ color: 'ord-color-seq-1' });

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

type Prompt = Record<string, unknown>;

/**
 * Enriches the row being edited with its variable's live codebook options
 * (the deleted `CategoricalBinPrompts/helpers.tsx` `itemSelector`), plus the
 * row's PRE-EDIT `variable` under a distinct key — `useOnBeforeSavePrompt`'s
 * unchanged-pick escape reads it from there, since `DialogArrayField` no
 * longer surfaces a dialog-form `initialValues` prop separately from the row.
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

    return {
      ...prompt,
      variableOptions,
      _originalVariable: prompt.variable,
    };
  };

const OrdinalBinPrompts = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');
  // Shared verbatim with CategoricalBin (as the `withPromptChangeHandler` HOC
  // it replaces was). Its "other variable" gate is a no-op here: OrdinalBin
  // prompts have no follow-up option.
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
        itemTemplate={template}
        onBeforeSave={onBeforeSave}
        itemSelector={makeItemSelector(entity, type)}
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default OrdinalBinPrompts;
