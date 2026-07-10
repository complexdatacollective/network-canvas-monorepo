/* eslint-disable react/jsx-props-no-spreading */
import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import DialogArrayField from '~/components/Form/DialogArrayField';
import ValidatedField from '~/components/Form/ValidatedField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import withDisabledSubjectRequired from '../../enhancers/withDisabledSubjectRequired';
import withSubject from '../../enhancers/withSubject';
import PromptFields from './PromptFields';
import PromptPreview from './PromptPreview';
const notEmpty = (value: unknown) =>
  value && Array.isArray(value) && value.length > 0
    ? undefined
    : 'You must create at least one item.';
type GeospatialPromptsProps = StageEditorSectionProps & {
  entity?: string;
  type?: string;
  disabled?: boolean;
  disabledMessage?: string;
};
const GeospatialPrompts = ({
  entity,
  type,
  disabled,
  disabledMessage,
}: GeospatialPromptsProps) => (
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
        editorProps: { entity, type },
        requestedEditFormName: 'editable-list-form',
        sortable: true,
      }}
    />
  </Section>
);
export default compose<GeospatialPromptsProps, StageEditorSectionProps>(
  withSubject,
  withDisabledSubjectRequired,
)(GeospatialPrompts);
