import type { ComponentType } from 'react';

import { Section } from '~/components/EditorLayout';
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
      // Both `withDisabledSubjectRequired` and `withDisabledAssetRequired`
      // used to gate this section, with the asset check innermost so its
      // `disabled` won and only the subject check's MESSAGE survived: with a
      // node type chosen but no data source, `Section`'s own default message
      // applies.
      disabled={!dataSource}
      disabledMessage={
        type ? undefined : 'Select a node type above to configure this section.'
      }
      layout="vertical"
      title={!dataSource ? 'Prompts' : undefined}
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
