/* eslint-disable react/jsx-props-no-spreading */
import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedFieldArray from '~/components/Form/ValidatedFieldArray';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withSubject from '../../enhancers/withSubject';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';
import withFormUsedVariableIndex from './withFormUsedVariableIndex';
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
type SociogramPromptsProps = StageEditorSectionProps & {
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
  usedVariableIndex?: Record<string, unknown>;
};
const SociogramPrompts = ({
  entity,
  type,
  disabled,
  disabledMessage,
  usedVariableIndex,
}: SociogramPromptsProps) => (
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
      component={DialogArrayField}
      validation={{ notEmpty }}
      componentProps={{
        addTitle: 'Edit Prompt',
        previewComponent: PromptPreview,
        editorFieldsComponent: PromptFields,
        editorTitle: 'Edit Prompt',
        itemLabel: 'prompt',
        editorProps: { entity, type, usedVariableIndex },
        requestedEditFormName: 'editable-list-form',
        sortable: true,
      }}
    />
  </Section>
);
export default compose<SociogramPromptsProps, StageEditorSectionProps>(
  withSubject,
  withFormUsedVariableIndex,
  withDisabledSubjectRequired,
)(SociogramPrompts);
