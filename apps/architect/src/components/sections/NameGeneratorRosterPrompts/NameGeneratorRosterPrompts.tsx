import type { ComponentType } from 'react';

import Section from '@codaco/fresco-ui/Section';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

// Imported from its own file rather than the `NameGeneratorPrompts` barrel
// index, which also re-exports the section component itself.
import PromptFields from '../NameGeneratorPrompts/PromptFields';
import PromptPreview from '../NameGeneratorPrompts/PromptPreview';

type Prompt = Record<string, unknown>;

const NameGeneratorRosterPrompts = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const dataSource = useStageFormValue<string>('dataSource');
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');

  return (
    <Section
      title="Prompt collection"
      description="Create and reorder the prompts shown in this stage."
      disabled={!dataSource}
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
        // No `currentStageIndex`: this section never supplied one, so the
        // additional-attributes pool keeps excluding this stage's own
        // committed roles exactly as before.
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default NameGeneratorRosterPrompts;
