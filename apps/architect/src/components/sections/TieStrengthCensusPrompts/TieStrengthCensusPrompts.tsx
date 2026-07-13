import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withSubject from '../../enhancers/withSubject';
import { itemSelector } from './helpers';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';
import withPromptChangeHandler from './withPromptChangeHandler';
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
type TieStrengthCensusPromptsProps = StageEditorSectionProps & {
  handleChangePrompt: (prompt: unknown) => unknown;
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
};
const TieStrengthCensusPrompts = ({
  handleChangePrompt,
  entity,
  type,
  disabled,
  disabledMessage,
}: TieStrengthCensusPromptsProps) => (
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
    <ValidatedFieldArray
      name="prompts"
      label="Prompts"
      labelHidden
      component={DialogArrayField}
      validation={{ notEmpty }}
      componentProps={{
        addTitle: 'Edit Prompt',
        previewComponent: PromptPreview,
        editorFieldsComponent: PromptFields,
        editorTitle: 'Edit Prompt',
        itemLabel: 'prompt',
        itemSelector: itemSelector(),
        onBeforeSave: handleChangePrompt,
        editorProps: { entity, type },
        requestedEditFormName: 'editable-list-form',
        sortable: true,
      }}
    />
  </Section>
);
export default compose<TieStrengthCensusPromptsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
  withPromptChangeHandler,
)(TieStrengthCensusPrompts);
