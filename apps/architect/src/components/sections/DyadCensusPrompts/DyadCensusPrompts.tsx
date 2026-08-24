import type { ComponentType } from 'react';

import { Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';

type Prompt = Record<string, unknown>;

const DyadCensusPrompts = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');

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
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default DyadCensusPrompts;
