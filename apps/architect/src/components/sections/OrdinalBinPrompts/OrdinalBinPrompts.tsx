import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import withDisabledSubjectRequired from '~/components/enhancers/withDisabledSubjectRequired';
import withSubject from '~/components/enhancers/withSubject';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedField from '~/components/Form/ValidatedField';
import { itemSelector } from '~/components/sections/CategoricalBinPrompts/helpers';
import withPromptChangeHandler from '~/components/sections/CategoricalBinPrompts/withPromptChangeHandler';
import { PromptPreview } from '~/components/sections/NameGeneratorPrompts';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import PromptFields from './PromptFields';
const template = () => ({ color: 'ord-color-seq-1' });
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
type OrdinalBinPromptsProps = StageEditorSectionProps & {
  handleChangePrompt: (data: unknown) => void;
  entity?: string | null;
  type?: string | null;
  disabled?: boolean;
  disabledMessage?: string;
};
const OrdinalBinPrompts = ({
  handleChangePrompt,
  entity = null,
  type = null,
  disabled,
  disabledMessage,
}: OrdinalBinPromptsProps) => (
  <Section
    disabled={disabled}
    disabledMessage={disabledMessage}
    summary={
      <Paragraph>
        Add one or more prompts below to frame the task for the user. You can
        reorder the prompts using the draggable handles on the left hand side.
      </Paragraph>
    }
    title="Prompts"
  >
    <ValidatedField
      name="prompts"
      label="Prompts"
      component={DialogArrayField}
      validation={{ notEmpty }}
      componentProps={{
        addTitle: 'Edit Prompt',
        previewComponent: PromptPreview,
        editorFieldsComponent: PromptFields,
        editorTitle: 'Edit Prompt',
        itemLabel: 'prompt',
        itemTemplate: template,
        onBeforeSave: handleChangePrompt,
        itemSelector: itemSelector(entity, type),
        editorProps: { entity, type },
        requestedEditFormName: 'editable-list-form',
        sortable: true,
      }}
    />
  </Section>
);
export default compose<OrdinalBinPromptsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
  withPromptChangeHandler,
)(OrdinalBinPrompts);
