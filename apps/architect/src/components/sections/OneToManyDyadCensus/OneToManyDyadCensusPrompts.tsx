import type { ComponentType } from 'react';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
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

const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';

type Prompt = Record<string, unknown>;

const OneToManyDyadCensusPrompts = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const initialPrompts = useStageInitialValue<Prompt[]>('prompts');

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
        editorProps={{ entity, type }}
        requestedEditFormName="editable-list-form"
        sortable
      />
    </Section>
  );
};

export default OneToManyDyadCensusPrompts;
