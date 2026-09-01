import type { ComponentType } from 'react';

import Section from '@codaco/fresco-ui/Section';
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

const OneToManyDyadCensusPrompts = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');

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
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default OneToManyDyadCensusPrompts;
